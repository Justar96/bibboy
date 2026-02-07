/**
 * Formatting utilities for chat display.
 * Following patterns from OpenClaw reference implementation.
 */

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format milliseconds timestamp to locale string.
 */
export function formatMs(ms?: number | null): string {
  if (!ms && ms !== 0) return "n/a"
  return new Date(ms).toLocaleString()
}

/**
 * Format timestamp as relative time (e.g., "5m ago").
 */
export function formatAgo(ms?: number | null): string {
  if (!ms && ms !== 0) return "n/a"
  const diff = Date.now() - ms
  if (diff < 0) return "just now"
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

/**
 * Format duration in milliseconds to human readable.
 */
export function formatDurationMs(ms?: number | null): string {
  if (!ms && ms !== 0) return "n/a"
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h`
  const day = Math.round(hr / 24)
  return `${day}d`
}

// ============================================================================
// Text Formatting
// ============================================================================

/**
 * Clamp text to max length with ellipsis.
 */
export function clampText(value: string, max = 120): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

/**
 * Truncate text with metadata about truncation.
 */
export function truncateText(
  value: string,
  max: number
): { text: string; truncated: boolean; total: number } {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length }
  }
  return {
    text: value.slice(0, Math.max(0, max)),
    truncated: true,
    total: value.length,
  }
}

/**
 * Format a list of values as comma-separated string.
 */
export function formatList(values?: Array<string | null | undefined>): string {
  if (!values || values.length === 0) return "none"
  return values.filter((v): v is string => Boolean(v && v.trim())).join(", ")
}

/**
 * Parse comma or newline separated input into array.
 */
export function parseList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

// ============================================================================
// Tool Result Helpers
// ============================================================================

import type { ToolExecutionResult } from "@bibboy/shared"

export interface SearchResult {
  title?: string
  url?: string
  snippet?: string
}

/** Extract concatenated text blocks from a tool execution result */
export function extractTextContent(result: ToolExecutionResult): string {
  return result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map(block => block.text)
    .join("")
}

// ============================================================================
// Tool Output Formatting
// ============================================================================

/** Character threshold for showing tool output inline vs collapsed */
export const TOOL_INLINE_THRESHOLD = 80

/** Maximum lines to show in collapsed preview */
export const PREVIEW_MAX_LINES = 2

/** Maximum characters to show in collapsed preview */
export const PREVIEW_MAX_CHARS = 100

/**
 * Format tool output content for display.
 * Detects JSON and formats it nicely.
 */
export function formatToolOutput(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      return JSON.stringify(parsed, null, 2)
    } catch {
      // Not valid JSON, return as-is
    }
  }
  return text
}

/**
 * Get a truncated preview of tool output text.
 */
export function getTruncatedPreview(text: string): string {
  const allLines = text.split("\n")
  const lines = allLines.slice(0, PREVIEW_MAX_LINES)
  const preview = lines.join("\n")
  if (preview.length > PREVIEW_MAX_CHARS) {
    return preview.slice(0, PREVIEW_MAX_CHARS) + "…"
  }
  return lines.length < allLines.length ? preview + "…" : preview
}

// ============================================================================
// Message Text Extraction
// ============================================================================

const THINKING_TAG_REGEX = /<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi

/**
 * Strip thinking/reasoning tags from text.
 */
export function stripThinkingTags(text: string): string {
  return text.replace(THINKING_TAG_REGEX, "").trim()
}

/**
 * Extract thinking content from text.
 */
export function extractThinking(text: string): string | null {
  const matches = [...text.matchAll(THINKING_TAG_REGEX)]
  const extracted = matches
    .map((m) => (m[1] ?? "").trim())
    .filter(Boolean)
  return extracted.length > 0 ? extracted.join("\n") : null
}

/**
 * Format reasoning/thinking content as markdown.
 */
export function formatReasoningMarkdown(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `_${line}_`)
  return lines.length ? ["_Reasoning:_", ...lines].join("\n") : ""
}

// ============================================================================
// HTML Escaping
// ============================================================================

/**
 * Escape HTML special characters.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
