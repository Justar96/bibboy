import type { ToolExecutionResult } from "@bibboy/shared"

// ============================================================================
// Tool Types (OpenClaw-inspired)
// ============================================================================

/**
 * JSON Schema type for tool parameters.
 */
export interface ToolParameterSchema {
  type: "object"
  properties: Record<string, {
    type: string
    description?: string
    enum?: string[]
    minimum?: number
    maximum?: number
    default?: unknown
  }>
  required?: string[]
}

/**
 * Agent tool definition.
 */
export interface AgentTool {
  /** Display label */
  label: string
  /** Unique tool name */
  name: string
  /** Description for the LLM */
  description: string
  /** JSON Schema for parameters */
  parameters: ToolParameterSchema
  /** Execute the tool */
  execute: (toolCallId: string, args: Record<string, unknown>) => Promise<ToolExecutionResult>
}

/**
 * Tool registry for managing available tools.
 */
export interface ToolRegistry {
  tools: AgentTool[]
  get: (name: string) => AgentTool | undefined
  getDefinitions: () => FunctionToolDefinition[]
}

/**
 * Function tool definition format for LLM APIs.
 */
export interface FunctionToolDefinition {
  type: "function"
  name: string
  description: string
  parameters: ToolParameterSchema
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a JSON result for tool output.
 */
export function jsonResult(payload: unknown): ToolExecutionResult {
  return {
    toolCallId: "",
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  }
}

/**
 * Create an error result for tool output.
 */
export function errorResult(error: string): ToolExecutionResult {
  return {
    toolCallId: "",
    content: [
      {
        type: "text",
        text: JSON.stringify({ error }),
      },
    ],
    error,
  }
}

/**
 * Read a string parameter from args.
 */
export function readStringParam(
  args: Record<string, unknown>,
  key: string,
  options?: { required?: boolean }
): string {
  const value = args[key]
  if (typeof value === "string") {
    return value.trim()
  }
  if (options?.required) {
    throw new Error(`Missing required parameter: ${key}`)
  }
  return ""
}

/**
 * Read a number parameter from args.
 */
export function readNumberParam(
  args: Record<string, unknown>,
  key: string,
  options?: { integer?: boolean; min?: number; max?: number }
): number | undefined {
  const value = args[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }
  let result = value
  if (options?.integer) {
    result = Math.floor(result)
  }
  if (options?.min !== undefined) {
    result = Math.max(options.min, result)
  }
  if (options?.max !== undefined) {
    result = Math.min(options.max, result)
  }
  return result
}

/**
 * Read a boolean parameter from args.
 */
export function readBooleanParam(
  args: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = args[key]
  if (typeof value === "boolean") {
    return value
  }
  return undefined
}

/**
 * Truncate text to max characters.
 */
export function truncateText(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false }
  }
  return {
    text: text.slice(0, maxChars) + "\n\n[Content truncated...]",
    truncated: true,
  }
}

/**
 * Create a timeout AbortSignal.
 */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  
  if (signal) {
    signal.addEventListener("abort", () => {
      clearTimeout(timeout)
      controller.abort()
    })
  }
  
  return controller.signal
}

/**
 * Normalize cache key.
 */
export function normalizeCacheKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, " ").trim()
}

// ============================================================================
// Cache Implementation
// ============================================================================

export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

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

export function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}
