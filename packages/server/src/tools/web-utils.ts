// ============================================================================
// Web Fetch Utilities (matching reference implementation)
// ============================================================================

export type ExtractMode = "markdown" | "text"

/**
 * Decode HTML entities.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gi, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
}

/**
 * Strip HTML tags.
 */
function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ""))
}

/**
 * Normalize whitespace.
 */
function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/**
 * Convert HTML to markdown.
 */
export function htmlToMarkdown(html: string): { text: string; title?: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? normalizeWhitespace(stripTags(titleMatch[1])) : undefined

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")

  // Convert links
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const label = normalizeWhitespace(stripTags(body))
    if (!label) {
      return href
    }
    return `[${label}](${href})`
  })

  // Convert headers
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => {
    const prefix = "#".repeat(Math.max(1, Math.min(6, Number.parseInt(level, 10))))
    const label = normalizeWhitespace(stripTags(body))
    return `\n${prefix} ${label}\n`
  })

  // Convert list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => {
    const label = normalizeWhitespace(stripTags(body))
    return label ? `\n- ${label}` : ""
  })

  // Convert breaks and block elements
  text = text
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|table|tr|ul|ol)>/gi, "\n")

  text = stripTags(text)
  text = normalizeWhitespace(text)

  return { text, title }
}

/**
 * Convert markdown to plain text.
 */
export function markdownToText(markdown: string): string {
  let text = markdown

  // Remove images
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "")

  // Convert links to just text
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, "$1")

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[^\n]*\n?/g, "").replace(/```/g, "")
  )

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, "$1")

  // Remove headers markers
  text = text.replace(/^#{1,6}\s+/gm, "")

  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, "")
  text = text.replace(/^\s*\d+\.\s+/gm, "")

  return normalizeWhitespace(text)
}

/**
 * Truncate text to max chars.
 */
export function truncateText(
  value: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false }
  }
  return { text: value.slice(0, maxChars), truncated: true }
}

/**
 * Extract readable content using Readability.
 * Falls back to basic HTML conversion if Readability fails.
 */
export async function extractReadableContent(params: {
  html: string
  url: string
  extractMode: ExtractMode
}): Promise<{ text: string; title?: string } | null> {
  const fallback = (): { text: string; title?: string } => {
    const rendered = htmlToMarkdown(params.html)
    if (params.extractMode === "text") {
      const text = markdownToText(rendered.text) || normalizeWhitespace(stripTags(params.html))
      return { text, title: rendered.title }
    }
    return rendered
  }

  try {
    // Dynamic imports for optional dependencies
    const [{ Readability }, { parseHTML }] = await Promise.all([
      import("@mozilla/readability"),
      import("linkedom"),
    ])

    const { document } = parseHTML(params.html)

    // Set base URI for relative links
    try {
      ;(document as { baseURI?: string }).baseURI = params.url
    } catch {
      // Best-effort base URI for relative links
    }

    const reader = new Readability(document, { charThreshold: 0 })
    const parsed = reader.parse()

    if (!parsed?.content) {
      return fallback()
    }

    const title = parsed.title || undefined

    if (params.extractMode === "text") {
      const text = normalizeWhitespace(parsed.textContent ?? "")
      return text ? { text, title } : fallback()
    }

    const rendered = htmlToMarkdown(parsed.content)
    return { text: rendered.text, title: title ?? rendered.title }
  } catch {
    // Readability not available, use fallback
    return fallback()
  }
}

// ============================================================================
// Web Shared Utilities
// ============================================================================

export const DEFAULT_CACHE_TTL_MINUTES = 5
export const DEFAULT_TIMEOUT_SECONDS = 15
export const DEFAULT_MAX_CACHE_ENTRIES = 100
export const DEFAULT_RETRY_ATTEMPTS = 3
export const DEFAULT_RETRY_BASE_MS = 1000

export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Normalize cache key.
 */
export function normalizeCacheKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Read from cache.
 */
export function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string
): CacheEntry<T> | null {
  const entry = cache.get(key)
  if (!entry) {
    return null
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry
}

/**
 * Write to cache with size limit enforcement.
 */
export function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
  maxEntries: number = DEFAULT_MAX_CACHE_ENTRIES
): void {
  // Evict expired entries first
  const now = Date.now()
  for (const [k, entry] of cache) {
    if (now > entry.expiresAt) {
      cache.delete(k)
    }
  }

  // If still over limit, evict oldest entries
  if (cache.size >= maxEntries) {
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    const toDelete = entries.slice(0, cache.size - maxEntries + 1)
    for (const [k] of toDelete) {
      cache.delete(k)
    }
  }

  cache.set(key, {
    value,
    expiresAt: now + ttlMs,
  })
}

/**
 * Read response text safely.
 */
export async function readResponseText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

/**
 * Resolve cache TTL in milliseconds.
 */
export function resolveCacheTtlMs(minutes: number | undefined, fallback: number): number {
  const resolved = typeof minutes === "number" && Number.isFinite(minutes) ? minutes : fallback
  return Math.max(0, resolved * 60 * 1000)
}

/**
 * Resolve timeout in seconds.
 */
export function resolveTimeoutSeconds(seconds: number | undefined, fallback: number): number {
  const resolved = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : fallback
  return Math.max(1, resolved)
}

/**
 * Create AbortSignal with timeout that properly cleans up.
 * Returns both signal and cleanup function.
 */
export function withTimeout(
  signal: AbortSignal | undefined,
  ms: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)

  const cleanup = () => clearTimeout(timer)

  if (signal) {
    signal.addEventListener("abort", () => {
      cleanup()
      controller.abort()
    }, { once: true })
  }

  controller.signal.addEventListener("abort", cleanup, { once: true })

  return { signal: controller.signal, cleanup }
}

/**
 * Check if error is retryable (transient network issues).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("504") ||
      msg.includes("429") // rate limit
    )
  }
  return false
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number
    baseMs?: number
    maxMs?: number
    shouldRetry?: (error: unknown) => boolean
  } = {}
): Promise<T> {
  const {
    attempts = DEFAULT_RETRY_ATTEMPTS,
    baseMs = DEFAULT_RETRY_BASE_MS,
    maxMs = 10000,
    shouldRetry = isRetryableError,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === attempts - 1 || !shouldRetry(error)) {
        throw error
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs)
      const jitter = delay * 0.2 * Math.random()
      await sleep(delay + jitter)
    }
  }

  throw lastError
}
