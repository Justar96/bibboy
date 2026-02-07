import { writeWorkspaceFile } from "../workspace"

// ============================================================================
// Tool Result Store
// ============================================================================
// Saves full web tool results to workspace files and returns compact summaries
// for the Gemini context. The agent can read full content via read_file if needed.
//
// Why: web_fetch can return 50K+ chars that bloat the function_response, wasting
// the model's context window and causing iteration exhaustion. A compact summary
// keeps the agentic loop fast; persisted files let the model drill down on demand.
// ============================================================================

/** Maximum chars for inline tool result (what goes into Gemini context) */
const MAX_INLINE_RESULT_CHARS = 4_000

/** Maximum chars for web_fetch content before saving to file */
const SAVE_THRESHOLD_CHARS = 3_000

/**
 * Compute adaptive inline limit based on iteration count.
 * As iterations grow, compact more aggressively to preserve context.
 */
function getAdaptiveInlineLimit(iteration: number): number {
  if (iteration >= 20) return 1_000
  if (iteration >= 10) return 2_000
  return MAX_INLINE_RESULT_CHARS
}

/** Session-scoped counter for unique filenames */
let resultCounter = 0

/**
 * Generate a short, filesystem-safe slug from a string.
 */
function slugify(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
}

// ============================================================================
// Search Result Compaction
// ============================================================================

interface SearchResultItem {
  title?: string
  url?: string
  description?: string
  published?: string
  siteName?: string
}

interface WebSearchPayload {
  query?: string
  provider?: string
  count?: number
  tookMs?: number
  results?: SearchResultItem[]
  cached?: boolean
  disabled?: boolean
  error?: string
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function parseJsonRecord(raw: string): JsonRecord {
  const parsed: unknown = JSON.parse(raw)
  return isRecord(parsed) ? parsed : {}
}

function parseSearchResultItems(value: unknown): SearchResultItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isRecord).map((item) => ({
    title: asString(item.title),
    url: asString(item.url),
    description: asString(item.description),
    published: asString(item.published),
    siteName: asString(item.siteName),
  }))
}

function parseWebSearchPayload(raw: string): WebSearchPayload {
  const record = parseJsonRecord(raw)

  return {
    query: asString(record.query),
    provider: asString(record.provider),
    count: asNumber(record.count),
    tookMs: asNumber(record.tookMs),
    results: parseSearchResultItems(record.results),
    cached: asBoolean(record.cached),
    disabled: asBoolean(record.disabled),
    error: asString(record.error),
  }
}

/**
 * Compact a web_search result to a concise summary.
 * Keeps titles + URLs but drops verbose descriptions.
 */
function compactSearchResult(payload: WebSearchPayload): string {
  if (payload.error || payload.disabled) {
    return JSON.stringify({
      query: payload.query,
      error: payload.error ?? "Search disabled",
    })
  }

  const results = (payload.results ?? []).map((r, i) => ({
    i: i + 1,
    title: r.title ?? "",
    url: r.url ?? "",
    site: r.siteName ?? "",
    ...(r.published ? { date: r.published } : {}),
    // Keep a short snippet (first 120 chars of description)
    snippet: r.description ? r.description.slice(0, 120) : "",
  }))

  return JSON.stringify({
    query: payload.query,
    provider: payload.provider,
    count: payload.count,
    tookMs: payload.tookMs,
    results,
  })
}

// ============================================================================
// Fetch Result Compaction + Persistence
// ============================================================================

interface WebFetchPayload {
  url?: string
  finalUrl?: string
  status?: number
  contentType?: string
  title?: string
  extractMode?: string
  extractor?: string
  truncated?: boolean
  length?: number
  fetchedAt?: string
  tookMs?: number
  text?: string
  cached?: boolean
  disabled?: boolean
  error?: string
}

function parseWebFetchPayload(raw: string): WebFetchPayload {
  const record = parseJsonRecord(raw)

  return {
    url: asString(record.url),
    finalUrl: asString(record.finalUrl),
    status: asNumber(record.status),
    contentType: asString(record.contentType),
    title: asString(record.title),
    extractMode: asString(record.extractMode),
    extractor: asString(record.extractor),
    truncated: asBoolean(record.truncated),
    length: asNumber(record.length),
    fetchedAt: asString(record.fetchedAt),
    tookMs: asNumber(record.tookMs),
    text: asString(record.text),
    cached: asBoolean(record.cached),
    disabled: asBoolean(record.disabled),
    error: asString(record.error),
  }
}

/**
 * Compact a web_fetch result: save full content to a file and return a summary.
 * If content is short enough, return it inline.
 */
async function compactFetchResult(
  payload: WebFetchPayload,
  agentId: string
): Promise<{ summary: string; savedFile?: string }> {
  if (payload.error || payload.disabled) {
    return {
      summary: JSON.stringify({
        url: payload.url,
        error: payload.error ?? "Fetch disabled",
      }),
    }
  }

  const text = payload.text ?? ""

  // Short content — return inline
  if (text.length < SAVE_THRESHOLD_CHARS) {
    return {
      summary: JSON.stringify({
        url: payload.url,
        title: payload.title,
        status: payload.status,
        length: text.length,
        text,
      }),
    }
  }

  // Long content — save to file, return compact summary
  resultCounter++
  const slug = slugify(payload.title || payload.url || "page")
  const filename = `web-fetch-${resultCounter}-${slug}.md`

  // Build markdown file with metadata header
  const fileContent = [
    `# ${payload.title || "Fetched Page"}`,
    "",
    `- **URL:** ${payload.url}`,
    payload.finalUrl && payload.finalUrl !== payload.url
      ? `- **Final URL:** ${payload.finalUrl}`
      : "",
    `- **Fetched:** ${payload.fetchedAt ?? new Date().toISOString()}`,
    `- **Length:** ${text.length} chars`,
    `- **Extractor:** ${payload.extractor ?? "unknown"}`,
    "",
    "---",
    "",
    text,
  ]
    .filter(Boolean)
    .join("\n")

  await writeWorkspaceFile(agentId, filename, fileContent)

  // Return summary with file reference and a preview
  const preview = text.slice(0, 500).replace(/\n+/g, " ").trim()
  return {
    summary: JSON.stringify({
      url: payload.url,
      title: payload.title,
      status: payload.status,
      length: text.length,
      savedTo: filename,
      hint: `Full content saved to workspace file "${filename}". Use read_file to access it.`,
      preview,
    }),
    savedFile: filename,
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Process a tool result for context-efficient feeding back to the model.
 *
 * For web_search: compacts to titles + URLs + short snippets.
 * For web_fetch:  saves long content to workspace file, returns summary.
 * For other tools: passes through (with truncation if too large).
 *
 * Returns the compact text to use in the Gemini functionResponse.
 */
export async function compactToolResult(
  toolName: string,
  rawResultText: string,
  agentId: string,
  iteration: number = 0
): Promise<string> {
  const inlineLimit = getAdaptiveInlineLimit(iteration)
  try {
    if (toolName === "web_search") {
      const payload = parseWebSearchPayload(rawResultText)
      return compactSearchResult(payload)
    }

    if (toolName === "web_fetch") {
      const payload = parseWebFetchPayload(rawResultText)
      const { summary } = await compactFetchResult(payload, agentId)
      return summary
    }

    // For all other tools: truncate if too large (adaptive limit)
    if (rawResultText.length > inlineLimit) {
      return rawResultText.slice(0, inlineLimit) + "\n[...truncated]"
    }

    return rawResultText
  } catch {
    // If parsing fails, just truncate
    if (rawResultText.length > inlineLimit) {
      return rawResultText.slice(0, inlineLimit) + "\n[...truncated]"
    }
    return rawResultText
  }
}

/**
 * Clean up saved tool result files from workspace.
 * Call this at the end of a session or periodically.
 */
export function resetResultCounter(): void {
  resultCounter = 0
}
