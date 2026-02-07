// ============================================================================
// Tool Display
// ============================================================================
// Resolves tool display metadata (emoji, title, detail) for UI rendering.
// Adapted from OpenClaw's tool-display.ts.
// ============================================================================

import displayConfig from "./tool-display.json"

const MAX_DETAIL_ENTRIES = 6
const MAX_DETAIL_VALUE_LENGTH = 80

interface ToolDisplayConfig {
  version: number
  fallback: { emoji: string; detailKeys: string[] }
  tools: Record<string, {
    emoji: string
    title: string
    detailKeys?: string[]
    actions?: Record<string, {
      label: string
      detailKeys?: string[]
    }>
  }>
}

export interface ResolvedToolDisplay {
  emoji: string
  title: string
  label: string
  detail: string
}

const config = displayConfig as ToolDisplayConfig

/**
 * Get a nested value from a record by dot-separated key path.
 */
function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Format a detail value for display.
 */
function formatDetailValue(value: unknown): string {
  if (value === undefined || value === null) return ""
  const str = typeof value === "string" ? value : JSON.stringify(value)
  if (str.length <= MAX_DETAIL_VALUE_LENGTH) return str
  return str.slice(0, MAX_DETAIL_VALUE_LENGTH) + "…"
}

/**
 * Resolve display metadata for a tool call.
 */
export function resolveToolDisplay(opts: {
  name: string
  args?: Record<string, unknown>
}): ResolvedToolDisplay {
  const { name, args = {} } = opts
  const toolEntry = config.tools[name]

  const emoji = toolEntry?.emoji ?? config.fallback.emoji
  const title = toolEntry?.title ?? name

  // Check for action-specific display (e.g., browser→open)
  const action = typeof args.action === "string" ? args.action : undefined
  const rawActionEntry = action && toolEntry?.actions?.[action]
  const actionEntry = rawActionEntry && typeof rawActionEntry === "object" ? rawActionEntry : undefined

  const detailKeys = actionEntry?.detailKeys ?? toolEntry?.detailKeys ?? config.fallback.detailKeys
  const actionLabel = actionEntry?.label ?? undefined
  const label = actionLabel ? `${title}: ${actionLabel}` : title

  // Build detail string from args
  const details: string[] = []
  for (const key of detailKeys) {
    if (details.length >= MAX_DETAIL_ENTRIES) break
    const value = getNestedValue(args, key)
    if (value === undefined || value === null) continue
    const formatted = formatDetailValue(value)
    if (formatted) details.push(formatted)
  }

  return {
    emoji,
    title,
    label,
    detail: details.join(" | "),
  }
}

/**
 * Format a tool call into a human-readable summary string.
 * e.g., "🔎 Web Search: latest AI news"
 */
export function formatToolSummary(display: ResolvedToolDisplay): string {
  const base = `${display.emoji} ${display.label}`
  if (display.detail) return `${base}: ${display.detail}`
  return base
}

/**
 * Build a display summary for a tool call by name + args.
 */
export function formatToolCallSummary(name: string, args?: Record<string, unknown>): string {
  return formatToolSummary(resolveToolDisplay({ name, args }))
}
