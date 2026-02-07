// ============================================================================
// Output Sanitization (ported from OpenClaw)
//
// Sanitizes all text shown to users:
// - Strips reasoning/thinking tags
// - Strips malformed tool call XML leakage
// - Rewrites raw API errors to safe user-facing messages
// - Collapses duplicate content blocks
// ============================================================================

import { stripFinalTagsFromText, stripThinkingTagsFromText } from "./reasoning-tags"

// ============================================================================
// Malformed Tool Call XML Stripping
// ============================================================================

/**
 * Strip malformed Minimax-style tool invocations that leak into text content.
 * Some models embed tool calls as XML in text blocks instead of using
 * proper structured tool calls.
 */
export function stripMalformedToolCallXml(text: string): string {
  if (!text) return text
  if (!/minimax:tool_call/i.test(text)) return text

  // Remove <invoke ...>...</invoke> blocks
  let cleaned = text.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "")

  // Remove stray minimax tool tags
  cleaned = cleaned.replace(/<\/?minimax:tool_call>/gi, "")

  return cleaned
}

/**
 * Strip downgraded tool call text representations that leak into text content.
 * When replaying history, tool calls may be downgraded to text blocks like
 * `[Tool Call: name (ID: ...)]`. These should not be shown to users.
 */
export function stripDowngradedToolCallText(text: string): string {
  if (!text) return text
  if (!/\[Tool (?:Call|Result)/i.test(text)) return text

  // Remove [Tool Call: ...] blocks and their Arguments
  let cleaned = text.replace(
    /\[Tool Call:[^\]]*\](?:\s*Arguments:?\s*(?:\{[\s\S]*?\}|\[[\s\S]*?\]|[^\n]*))?/gi,
    ""
  )

  // Remove [Tool Result for ID ...] blocks and their content
  cleaned = cleaned.replace(
    /\[Tool Result for ID[^\]]*\]\n?[\s\S]*?(?=\n*\[Tool |\n*$)/gi,
    ""
  )

  return cleaned.trim()
}

// ============================================================================
// Duplicate Content Collapse
// ============================================================================

/**
 * Collapse consecutive duplicate content blocks.
 * Splits on double-newlines and deduplicates consecutive blocks
 * that normalize to the same whitespace-collapsed string.
 */
function collapseConsecutiveDuplicateBlocks(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return text

  const blocks = trimmed.split(/\n{2,}/)
  if (blocks.length < 2) return text

  const normalizeBlock = (value: string) => value.trim().replace(/\s+/g, " ")
  const result: string[] = []
  let lastNormalized: string | null = null

  for (const block of blocks) {
    const normalized = normalizeBlock(block)
    if (lastNormalized && normalized === lastNormalized) continue
    result.push(block.trim())
    lastNormalized = normalized
  }

  if (result.length === blocks.length) return text
  return result.join("\n\n")
}

// ============================================================================
// Error Detection Helpers
// ============================================================================

const ERROR_PREFIX_RE =
  /^(?:error|api\s*error|openai\s*error|anthropic\s*error|gateway\s*error|request failed|failed|exception)[:\s-]+/i
const HTTP_STATUS_PREFIX_RE = /^(?:http\s*)?(\d{3})\s+(.+)$/i
const HTTP_ERROR_HINTS = [
  "error", "bad request", "not found", "unauthorized", "forbidden",
  "internal server", "service unavailable", "gateway", "rate limit",
  "overloaded", "timeout", "timed out", "invalid", "too many requests", "permission",
]

function isLikelyHttpErrorText(raw: string): boolean {
  const match = raw.match(HTTP_STATUS_PREFIX_RE)
  if (!match) return false
  const code = Number(match[1])
  if (!Number.isFinite(code) || code < 400) return false
  const message = match[2].toLowerCase()
  return HTTP_ERROR_HINTS.some((hint) => message.includes(hint))
}

function isRawApiErrorPayload(raw?: string): boolean {
  if (!raw) return false
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return (
      parsed.type === "error" ||
      typeof parsed.request_id === "string" ||
      typeof parsed.requestId === "string" ||
      (parsed.error !== null && typeof parsed.error === "object")
    )
  } catch {
    return false
  }
}

function isContextOverflowError(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes("request_too_large") ||
    lower.includes("context length exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("prompt is too long") ||
    lower.includes("exceeds model context window") ||
    lower.includes("context overflow") ||
    (lower.includes("413") && lower.includes("too large"))
  )
}

function isRateLimitErrorMessage(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes("rate limit") || lower.includes("rate_limit") ||
    lower.includes("too many requests") || lower.includes("429") ||
    lower.includes("quota exceeded")
  )
}

function isOverloadedErrorMessage(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes("overloaded") || lower.includes("503") || lower.includes("service unavailable")
}

function isTimeoutErrorMessage(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline exceeded")
}

function isBillingErrorMessage(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes("billing") || lower.includes("payment required") ||
    lower.includes("insufficient credits") || lower.includes("402")
  )
}

/**
 * Format a raw API error payload into a user-friendly string.
 */
function formatRawAssistantErrorForUi(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return "LLM request failed with an unknown error."

  const httpMatch = trimmed.match(HTTP_STATUS_PREFIX_RE)
  if (httpMatch) {
    const rest = httpMatch[2].trim()
    if (!rest.startsWith("{")) return `HTTP ${httpMatch[1]}: ${rest}`
  }

  // Try to parse JSON error payload
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const error = parsed.error as Record<string, unknown> | undefined
    const message = (error?.message ?? parsed.message) as string | undefined
    if (message) return message
  } catch {
    // Not JSON
  }

  return trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed
}

// ============================================================================
// Main Sanitization Functions
// ============================================================================

const BILLING_ERROR_USER_MESSAGE =
  "API provider returned a billing error. Check your provider's billing dashboard."

/**
 * Sanitize text for user display (matching OpenClaw's sanitizeUserFacingText).
 *
 * Applied to ALL text shown to users:
 * 1. Strip <final> tags
 * 2. Detect and rewrite known error patterns to safe messages
 * 3. Collapse consecutive duplicate blocks
 */
export function sanitizeUserFacingText(text: string): string {
  if (!text) return text

  const stripped = stripFinalTagsFromText(text)
  const trimmed = stripped.trim()
  if (!trimmed) return stripped

  // Rewrite known error messages to safe user-facing versions
  if (/incorrect role information|roles must alternate/i.test(trimmed)) {
    return "Message ordering conflict - please try again."
  }

  if (isContextOverflowError(trimmed)) {
    return "Context overflow: prompt too large for the model."
  }

  if (isBillingErrorMessage(trimmed)) {
    return BILLING_ERROR_USER_MESSAGE
  }

  if (isRawApiErrorPayload(trimmed) || isLikelyHttpErrorText(trimmed)) {
    return formatRawAssistantErrorForUi(trimmed)
  }

  if (ERROR_PREFIX_RE.test(trimmed)) {
    if (isOverloadedErrorMessage(trimmed) || isRateLimitErrorMessage(trimmed)) {
      return "The AI service is temporarily overloaded. Please try again in a moment."
    }
    if (isTimeoutErrorMessage(trimmed)) {
      return "Request timed out. Please try again."
    }
    return formatRawAssistantErrorForUi(trimmed)
  }

  return collapseConsecutiveDuplicateBlocks(stripped)
}

/**
 * Full output sanitization pipeline (matching OpenClaw's extractAssistantText).
 *
 * Applies the complete strip chain:
 * 1. Strip malformed tool call XML
 * 2. Strip downgraded tool call text
 * 3. Strip thinking/reasoning tags
 * 4. Sanitize user-facing text (error rewriting, dedup)
 */
export function sanitizeAssistantOutput(text: string): string {
  if (!text) return text

  const cleaned = stripThinkingTagsFromText(
    stripDowngradedToolCallText(
      stripMalformedToolCallXml(text)
    )
  ).trim()

  return sanitizeUserFacingText(cleaned)
}
