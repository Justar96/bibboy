import type { ToolExecutionResult } from "@bibboy/shared"
import type { AgentTool } from "./types"
import { jsonResult, readStringParam, readNumberParam } from "./types"
import {
  type CacheEntry,
  type ExtractMode,
  truncateText,
  extractReadableContent,
  htmlToMarkdown,
  normalizeCacheKey,
  readCache,
  writeCache,
  withTimeout,
  withRetry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
} from "./web-utils"

// ============================================================================
// Web Fetch Tool (Enhanced - matching reference implementation)
// ============================================================================

const DEFAULT_FETCH_MAX_CHARS = 50_000
const DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_SECONDS * 1000
const DEFAULT_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MINUTES * 60 * 1000
const DEFAULT_MAX_REDIRECTS = 5

const FETCH_CACHE = new Map<string, CacheEntry<WebFetchResult>>()

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

interface WebFetchResult {
  url: string
  finalUrl: string
  status: number
  contentType: string
  title?: string
  extractMode: ExtractMode
  extractor: string
  truncated: boolean
  length: number
  fetchedAt: string
  tookMs: number
  text: string
  cached?: boolean
  disabled?: boolean
  error?: string
}

/**
 * Check if status is a redirect.
 */
function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

/**
 * Check if content looks like HTML.
 */
function looksLikeHtml(value: string): boolean {
  const trimmed = value.trimStart()
  if (!trimmed) {
    return false
  }
  const head = trimmed.slice(0, 256).toLowerCase()
  return head.startsWith("<!doctype html") || head.startsWith("<html")
}

/**
 * Fetch with redirect handling.
 */
async function fetchWithRedirects(params: {
  url: string
  maxRedirects: number
  timeoutMs: number
  userAgent: string
}): Promise<{ response: Response; finalUrl: string }> {
  const { signal, cleanup } = withTimeout(undefined, params.timeoutMs)
  const visited = new Set<string>()
  let currentUrl = params.url
  let redirectCount = 0

  try {
    while (true) {
      let parsedUrl: URL
      try {
        parsedUrl = new URL(currentUrl)
      } catch {
        throw new Error("Invalid URL: must be http or https")
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid URL: must be http or https")
      }

      const res = await fetch(parsedUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "*/*",
          "User-Agent": params.userAgent,
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal,
        redirect: "manual",
      })

      if (isRedirectStatus(res.status)) {
        const location = res.headers.get("location")
        if (!location) {
          throw new Error(`Redirect missing location header (${res.status})`)
        }
        redirectCount += 1
        if (redirectCount > params.maxRedirects) {
          throw new Error(`Too many redirects (limit: ${params.maxRedirects})`)
        }
        const nextUrl = new URL(location, parsedUrl).toString()
        if (visited.has(nextUrl)) {
          throw new Error("Redirect loop detected")
        }
        visited.add(nextUrl)
        currentUrl = nextUrl
        continue
      }

      return { response: res, finalUrl: currentUrl }
    }
  } finally {
    cleanup()
  }
}

/**
 * Run web fetch with intelligent extraction.
 */
async function runWebFetch(params: {
  url: string
  extractMode: ExtractMode
  maxChars: number
  maxRedirects: number
  timeoutMs: number
  cacheTtlMs: number
  userAgent: string
}): Promise<WebFetchResult> {
  const cacheKey = normalizeCacheKey(`fetch:${params.url}:${params.extractMode}:${params.maxChars}`)
  const cached = readCache(FETCH_CACHE, cacheKey)
  if (cached) {
    return { ...cached.value, cached: true }
  }

  const start = Date.now()

  const { response: res, finalUrl } = await withRetry(
    () => fetchWithRedirects({
      url: params.url,
      maxRedirects: params.maxRedirects,
      timeoutMs: params.timeoutMs,
      userAgent: params.userAgent,
    }),
    { attempts: 3 }
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Web fetch failed (${res.status}): ${detail || res.statusText}`)
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream"
  const body = await res.text()

  let title: string | undefined
  let extractor = "raw"
  let text = body

  const isHtml = contentType.includes("text/html") || looksLikeHtml(body)
  const isJson = contentType.includes("application/json")

  if (isHtml) {
    // Try Readability extraction first
    const readable = await extractReadableContent({
      html: body,
      url: finalUrl,
      extractMode: params.extractMode,
    })

    if (readable) {
      text = readable.text
      title = readable.title
      extractor = "readability"
    } else {
      // Fallback to basic HTML parsing
      const result = htmlToMarkdown(body)
      text = result.text
      title = result.title
      extractor = "html-to-markdown"
    }
  } else if (isJson) {
    try {
      text = JSON.stringify(JSON.parse(body), null, 2)
      extractor = "json"
    } catch {
      text = body
      extractor = "raw"
    }
  }

  const truncated = truncateText(text, params.maxChars)

  const payload = {
    url: params.url,
    finalUrl,
    status: res.status,
    contentType,
    title,
    extractMode: params.extractMode,
    extractor,
    truncated: truncated.truncated,
    length: truncated.text.length,
    fetchedAt: new Date().toISOString(),
    tookMs: Date.now() - start,
    text: truncated.text,
  }

  writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs)
  return payload
}

/**
 * Create web_fetch tool.
 */
export function createWebFetchTool(): AgentTool {
  return {
    label: "Web Fetch",
    name: "web_fetch",
    description:
      "Fetch and extract readable content from a URL. Converts HTML to plain text. Use for reading specific web pages, documentation, or articles.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP or HTTPS URL to fetch.",
        },
        extractMode: {
          type: "string",
          description: 'Extraction mode ("markdown" or "text").',
          enum: ["markdown", "text"],
          default: "text",
        },
        maxChars: {
          type: "number",
          description: "Maximum characters to return (truncates when exceeded).",
          minimum: 100,
        },
      },
      required: ["url"],
    },
    execute: async (_toolCallId, args): Promise<ToolExecutionResult> => {
      try {
        const url = readStringParam(args, "url", { required: true })
        const extractMode = (readStringParam(args, "extractMode") || "text") as ExtractMode
        const maxChars = readNumberParam(args, "maxChars", { integer: true, min: 100 }) ?? DEFAULT_FETCH_MAX_CHARS

        const result = await runWebFetch({
          url,
          extractMode,
          maxChars,
          maxRedirects: DEFAULT_MAX_REDIRECTS,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          cacheTtlMs: DEFAULT_CACHE_TTL_MS,
          userAgent: DEFAULT_USER_AGENT,
        })

        return jsonResult(result)
      } catch (error) {
        // Graceful error handling - never throw, return disabled state
        const message = error instanceof Error ? error.message : "Unknown error"
        const result: WebFetchResult = {
          url: typeof args?.url === "string" ? args.url : "",
          finalUrl: "",
          status: 0,
          contentType: "",
          extractMode: "text",
          extractor: "none",
          truncated: false,
          length: 0,
          fetchedAt: new Date().toISOString(),
          tookMs: 0,
          text: "",
          disabled: true,
          error: message,
        }
        return jsonResult(result)
      }
    },
  }
}
