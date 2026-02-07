// ============================================================================
// Reasoning Tag Stripping (ported from OpenClaw)
//
// Strips <think>, <thinking>, <thought>, <antthinking>, <final> tags from
// model output while preserving them when they appear inside code blocks.
// ============================================================================

export type ReasoningTagMode = "strict" | "preserve"
export type ReasoningTagTrim = "none" | "start" | "both"

const QUICK_TAG_RE = /<\s*\/?\s*(?:think(?:ing)?|thought|antthinking|final)\b/i
const FINAL_TAG_RE = /<\s*\/?\s*final\b[^<>]*>/gi
const THINKING_TAG_RE = /<\s*(\/?)\s*(?:think(?:ing)?|thought|antthinking)\b[^<>]*>/gi

interface CodeRegion {
  start: number
  end: number
}

/**
 * Find fenced (```) and inline (``) code regions in text.
 * Used to avoid stripping tags that appear inside code blocks.
 */
function findCodeRegions(text: string): CodeRegion[] {
  const regions: CodeRegion[] = []

  const fencedRe = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(?:\n\2(?:\n|$)|$)/g
  for (const match of text.matchAll(fencedRe)) {
    const start = (match.index ?? 0) + match[1].length
    regions.push({ start, end: start + match[0].length - match[1].length })
  }

  const inlineRe = /`+[^`]+`+/g
  for (const match of text.matchAll(inlineRe)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const insideFenced = regions.some((r) => start >= r.start && end <= r.end)
    if (!insideFenced) {
      regions.push({ start, end })
    }
  }

  regions.sort((a, b) => a.start - b.start)
  return regions
}

function isInsideCode(pos: number, regions: CodeRegion[]): boolean {
  return regions.some((r) => pos >= r.start && pos < r.end)
}

function applyTrim(value: string, mode: ReasoningTagTrim): string {
  if (mode === "none") return value
  if (mode === "start") return value.trimStart()
  return value.trim()
}

/**
 * Strip reasoning tags from text while preserving tags inside code blocks.
 *
 * - `<final>` tags: removed (content kept)
 * - `<think>...</think>`: removed with content (strict mode) or content kept (preserve mode)
 * - Tags inside fenced/inline code blocks are never touched
 */
export function stripReasoningTagsFromText(
  text: string,
  options?: {
    mode?: ReasoningTagMode
    trim?: ReasoningTagTrim
  }
): string {
  if (!text) return text
  if (!QUICK_TAG_RE.test(text)) return text

  const mode = options?.mode ?? "strict"
  const trimMode = options?.trim ?? "both"

  let cleaned = text

  // Step 1: Strip <final> tags (keep content)
  if (FINAL_TAG_RE.test(cleaned)) {
    FINAL_TAG_RE.lastIndex = 0
    const finalMatches: Array<{ start: number; length: number; inCode: boolean }> = []
    const preCodeRegions = findCodeRegions(cleaned)

    for (const match of cleaned.matchAll(FINAL_TAG_RE)) {
      const start = match.index ?? 0
      finalMatches.push({
        start,
        length: match[0].length,
        inCode: isInsideCode(start, preCodeRegions),
      })
    }

    // Remove in reverse to preserve indices
    for (let i = finalMatches.length - 1; i >= 0; i--) {
      const m = finalMatches[i]
      if (!m.inCode) {
        cleaned = cleaned.slice(0, m.start) + cleaned.slice(m.start + m.length)
      }
    }
  } else {
    FINAL_TAG_RE.lastIndex = 0
  }

  // Step 2: Strip <think>...</think> blocks
  const codeRegions = findCodeRegions(cleaned)

  THINKING_TAG_RE.lastIndex = 0
  let result = ""
  let lastIndex = 0
  let inThinking = false

  for (const match of cleaned.matchAll(THINKING_TAG_RE)) {
    const idx = match.index ?? 0
    const isClose = match[1] === "/"

    if (isInsideCode(idx, codeRegions)) continue

    if (!inThinking) {
      result += cleaned.slice(lastIndex, idx)
      if (!isClose) {
        inThinking = true
      }
    } else if (isClose) {
      inThinking = false
    }

    lastIndex = idx + match[0].length
  }

  if (!inThinking || mode === "preserve") {
    result += cleaned.slice(lastIndex)
  }

  return applyTrim(result, trimMode)
}

/**
 * Strip <final> tags only (keep content).
 */
export function stripFinalTagsFromText(text: string): string {
  if (!text) return text
  return text.replace(FINAL_TAG_RE, "")
}

/**
 * Convenience: strip thinking tags in strict mode with both-side trim.
 */
export function stripThinkingTagsFromText(text: string): string {
  return stripReasoningTagsFromText(text, { mode: "strict", trim: "both" })
}
