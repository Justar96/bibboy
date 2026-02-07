import type { ToolExecutionResult } from "@bibboy/shared"
import type { AgentTool } from "./types"
import { jsonResult, readStringParam, readNumberParam } from "./types"
import {
  type CacheEntry,
  normalizeCacheKey,
  readCache,
  writeCache,
  withTimeout,
  withRetry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
} from "./web-utils"

// ============================================================================
// Web Search Tool (Enhanced - matching reference implementation)
// ============================================================================

const DEFAULT_SEARCH_COUNT = 5
const MAX_SEARCH_COUNT = 10
const DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_SECONDS * 1000
const DEFAULT_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MINUTES * 60 * 1000

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search"
const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions"

const SEARCH_CACHE = new Map<string, CacheEntry<WebSearchResult>>()

type SearchProvider = "brave" | "perplexity"
type FreshnessFilter = "pd" | "pw" | "pm" | "py"

interface SearchResultItem {
  title: string
  url: string
  description: string
  published?: string
  siteName?: string
}

interface WebSearchResult {
  query: string
  provider: SearchProvider
  count: number
  tookMs: number
  results: SearchResultItem[]
  cached?: boolean
  disabled?: boolean
  error?: string
}

interface BraveSearchResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function getStringField(record: JsonRecord, key: string): string | null {
  const value = record[key]
  return typeof value === "string" ? value : null
}

function parseBraveSearchResponse(data: unknown): BraveSearchResult[] | null {
  if (!isRecord(data)) return null

  const web = data.web
  if (web !== undefined && !isRecord(web)) return null

  const rawResults = isRecord(web) && Array.isArray(web.results) ? web.results : []

  const results: BraveSearchResult[] = []
  for (const entry of rawResults) {
    if (!isRecord(entry)) continue
    results.push({
      title: getStringField(entry, "title") ?? undefined,
      url: getStringField(entry, "url") ?? undefined,
      description: getStringField(entry, "description") ?? undefined,
      age: getStringField(entry, "age") ?? undefined,
    })
  }

  return results
}

/**
 * Extract site name from URL.
 */
function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * Run web search using Brave Search API.
 */
async function runBraveSearch(params: {
  query: string
  count: number
  apiKey: string
  timeoutMs: number
  country?: string
  freshness?: FreshnessFilter
}): Promise<{ results: SearchResultItem[]; tookMs: number }> {
  const start = Date.now()

  const url = new URL(BRAVE_SEARCH_ENDPOINT)
  url.searchParams.set("q", params.query)
  url.searchParams.set("count", String(params.count))
  if (params.country) {
    url.searchParams.set("country", params.country)
  }
  if (params.freshness) {
    url.searchParams.set("freshness", params.freshness)
  }

  const data = await withRetry(async () => {
    const { signal, cleanup } = withTimeout(undefined, params.timeoutMs)
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": params.apiKey,
        },
        signal,
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(`Brave Search API error (${res.status}): ${detail || res.statusText}`)
      }

      const raw: unknown = await res.json()
      const parsedResults = parseBraveSearchResponse(raw)
      if (!parsedResults) {
        throw new Error("Unexpected Brave Search API response shape")
      }
      return parsedResults
    } finally {
      cleanup()
    }
  }, { attempts: 3 })

  const results = data.map((entry) => ({
    title: entry.title ?? "",
    url: entry.url ?? "",
    description: entry.description ?? "",
    published: entry.age ?? undefined,
    siteName: resolveSiteName(entry.url ?? ""),
  }))

  return { results, tookMs: Date.now() - start }
}

/**
 * Run web search using Perplexity API.
 */
async function runPerplexitySearch(params: {
  query: string
  count: number
  apiKey: string
  timeoutMs: number
}): Promise<{ results: SearchResultItem[]; tookMs: number; answer?: string }> {
  const start = Date.now()

  interface ParsedPerplexityResponse {
    answer: string
    citations: string[]
  }

  function parsePerplexityResponse(data: unknown): ParsedPerplexityResponse | null {
    if (!isRecord(data)) return null

    if (data.choices !== undefined && !Array.isArray(data.choices)) {
      return null
    }
    if (data.citations !== undefined && !Array.isArray(data.citations)) {
      return null
    }

    const choices = Array.isArray(data.choices) ? data.choices : []
    const firstChoice = choices[0]
    let answer = ""
    if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
      answer = getStringField(firstChoice.message, "content") ?? ""
    }

    const citationsRaw = Array.isArray(data.citations) ? data.citations : []
    const citations = citationsRaw.filter((citation): citation is string => typeof citation === "string")

    return { answer, citations }
  }

  const data = await withRetry(async () => {
    const { signal, cleanup } = withTimeout(undefined, params.timeoutMs)
    try {
      const res = await fetch(PERPLEXITY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "user",
              content: params.query,
            },
          ],
          max_completion_tokens: 1024,
        }),
        signal,
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(`Perplexity API error (${res.status}): ${detail || res.statusText}`)
      }

      const raw: unknown = await res.json()
      const parsed = parsePerplexityResponse(raw)
      if (!parsed) {
        throw new Error("Unexpected Perplexity API response shape")
      }
      return parsed
    } finally {
      cleanup()
    }
  }, { attempts: 3 })
  const { answer, citations } = data

  // Convert citations to search result format
  const results: SearchResultItem[] = citations.slice(0, params.count).map((citation, i) => ({
    title: `Source ${i + 1}`,
    url: citation,
    description: "",
    siteName: resolveSiteName(citation),
  }))

  return { results, tookMs: Date.now() - start, answer }
}

function parseSearchProvider(
  value: string | undefined,
  fallback: SearchProvider
): SearchProvider {
  if (value === "brave" || value === "perplexity") {
    return value
  }
  return fallback
}

function parseFreshnessFilter(value: string | undefined): FreshnessFilter | undefined {
  if (value === "pd" || value === "pw" || value === "pm" || value === "py") {
    return value
  }
  return undefined
}

/**
 * Run web search with provider selection.
 */
async function runWebSearch(params: {
  query: string
  count: number
  provider: SearchProvider
  braveApiKey?: string
  perplexityApiKey?: string
  timeoutMs: number
  cacheTtlMs: number
  country?: string
  freshness?: FreshnessFilter
}): Promise<WebSearchResult> {
  const cacheKey = normalizeCacheKey(
    `${params.provider}:${params.query}:${params.count}:${params.country || "default"}:${params.freshness || "default"}`
  )
  const cached = readCache(SEARCH_CACHE, cacheKey)
  if (cached) {
    return { ...cached.value, cached: true }
  }

  let searchResult: { results: SearchResultItem[]; tookMs: number; answer?: string }
  let providerUsed: SearchProvider | null = null

  if (params.provider === "perplexity" && params.perplexityApiKey) {
    searchResult = await runPerplexitySearch({
      query: params.query,
      count: params.count,
      apiKey: params.perplexityApiKey,
      timeoutMs: params.timeoutMs,
    })
    providerUsed = "perplexity"
  } else if (params.provider === "brave" && params.braveApiKey) {
    searchResult = await runBraveSearch({
      query: params.query,
      count: params.count,
      apiKey: params.braveApiKey,
      timeoutMs: params.timeoutMs,
      country: params.country,
      freshness: params.freshness,
    })
    providerUsed = "brave"
  } else if (params.braveApiKey) {
    searchResult = await runBraveSearch({
      query: params.query,
      count: params.count,
      apiKey: params.braveApiKey,
      timeoutMs: params.timeoutMs,
      country: params.country,
      freshness: params.freshness,
    })
    providerUsed = "brave"
  } else if (params.perplexityApiKey) {
    searchResult = await runPerplexitySearch({
      query: params.query,
      count: params.count,
      apiKey: params.perplexityApiKey,
      timeoutMs: params.timeoutMs,
    })
    providerUsed = "perplexity"
  } else {
    throw new Error("No search API key configured")
  }

  const payload: WebSearchResult = {
    query: params.query,
    provider: providerUsed,
    count: searchResult.results.length,
    tookMs: searchResult.tookMs,
    results: searchResult.results,
  }

  writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs)
  return payload
}

/**
 * Create web_search tool.
 */
export function createWebSearchTool(): AgentTool {
  const braveApiKey = process.env.BRAVE_API_KEY?.trim()
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY?.trim()

  // Determine default provider
  const defaultProvider: SearchProvider = perplexityApiKey ? "perplexity" : "brave"
  const hasAnyProvider = braveApiKey || perplexityApiKey

  return {
    label: "Web Search",
    name: "web_search",
    description:
      "Search the web using Brave or Perplexity API. Returns titles, URLs, and snippets for fast research. Use for current events, facts, or any information that might be outdated in training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string.",
        },
        count: {
          type: "number",
          description: "Number of results to return (1-10).",
          minimum: 1,
          maximum: MAX_SEARCH_COUNT,
        },
        provider: {
          type: "string",
          description: "Search provider to use ('brave' or 'perplexity').",
          enum: ["brave", "perplexity"],
        },
        country: {
          type: "string",
          description:
            "2-letter country code for region-specific results (e.g., 'DE', 'US'). Brave only.",
        },
        freshness: {
          type: "string",
          description:
            "Filter by discovery time: 'pd' (past 24h), 'pw' (past week), 'pm' (past month), 'py' (past year). Brave only.",
          enum: ["pd", "pw", "pm", "py"],
        },
      },
      required: ["query"],
    },
    execute: async (_toolCallId, args): Promise<ToolExecutionResult> => {
      // Graceful handling when no API key configured
      if (!hasAnyProvider) {
        const result: WebSearchResult = {
          query: typeof args?.query === "string" ? args.query : "",
          provider: "brave",
          count: 0,
          tookMs: 0,
          results: [],
          disabled: true,
          error: "Web search requires BRAVE_API_KEY or PERPLEXITY_API_KEY environment variable.",
        }
        return jsonResult(result)
      }

      try {
        const query = readStringParam(args, "query", { required: true })
        const count =
          readNumberParam(args, "count", { integer: true, min: 1, max: MAX_SEARCH_COUNT }) ??
          DEFAULT_SEARCH_COUNT
        const provider = parseSearchProvider(readStringParam(args, "provider") || undefined, defaultProvider)
        const country = readStringParam(args, "country") || undefined
        const freshness = parseFreshnessFilter(readStringParam(args, "freshness") || undefined)

        const result = await runWebSearch({
          query,
          count,
          provider,
          braveApiKey,
          perplexityApiKey,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          cacheTtlMs: DEFAULT_CACHE_TTL_MS,
          country,
          freshness,
        })

        return jsonResult(result)
      } catch (error) {
        // Graceful error handling - never throw
        const message = error instanceof Error ? error.message : "Unknown error"
        const result: WebSearchResult = {
          query: typeof args?.query === "string" ? args.query : "",
          provider: defaultProvider,
          count: 0,
          tookMs: 0,
          results: [],
          disabled: true,
          error: message,
        }
        return jsonResult(result)
      }
    },
  }
}
