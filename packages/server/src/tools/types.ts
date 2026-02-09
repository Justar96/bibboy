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
 * Tool group names for dynamic tool loading.
 */
export type ToolGroupName = "core" | "web" | "workspace"

/**
 * Tool group metadata for the request_tools meta-tool.
 */
export interface ToolGroupInfo {
  name: ToolGroupName
  description: string
  toolNames: string[]
  loaded: boolean
}

/**
 * Tool registry for managing available tools.
 * Supports dynamic tool loading via addTools() for modern agent patterns.
 */
export interface ToolRegistry {
  tools: AgentTool[]
  get: (name: string) => AgentTool | undefined
  getDefinitions: () => FunctionToolDefinition[]
  /** Dynamically add tools to the registry mid-conversation */
  addTools: (newTools: AgentTool[]) => void
  /** Get tool group metadata for request_tools */
  getGroups: () => ToolGroupInfo[]
  /** Mark a group as loaded */
  markGroupLoaded: (group: ToolGroupName) => void
  /** Check if a group is loaded */
  isGroupLoaded: (group: ToolGroupName) => boolean
  /** Get a compact summary of available tools for system prompt injection */
  getToolSummary: () => string
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
// Tool Wrapping (OpenClaw-inspired middleware pattern)
// ============================================================================

/** Context passed to each tool execution for cancellation and timeout. */
export interface ToolExecutionContext {
  /** Signal for request-level cancellation */
  abortSignal?: AbortSignal
  /** Per-tool timeout in ms (default: 30_000) */
  timeoutMs?: number
  /** Current loop iteration for budget-aware tools */
  iteration?: number
  /** Per-session metrics tracker */
  metrics?: ToolExecutionMetrics
}

// ============================================================================
// Tool Execution Metrics (per-session tracking)
// ============================================================================

export interface ToolMetricEntry {
  count: number
  totalDurationMs: number
  errors: number
  lastUsedAt: number
}

/** Tracks tool execution metrics across an agent session. */
export interface ToolExecutionMetrics {
  /** Per-tool metrics keyed by tool name */
  tools: Map<string, ToolMetricEntry>
  /** Record a tool execution */
  record: (name: string, durationMs: number, error: boolean) => void
  /** Get summary for system prompt injection */
  getSummary: () => string
}

/** Create a new metrics tracker. */
export function createToolExecutionMetrics(): ToolExecutionMetrics {
  const tools = new Map<string, ToolMetricEntry>()

  return {
    tools,
    record(name: string, durationMs: number, error: boolean) {
      const entry = tools.get(name) ?? { count: 0, totalDurationMs: 0, errors: 0, lastUsedAt: 0 }
      entry.count++
      entry.totalDurationMs += durationMs
      if (error) entry.errors++
      entry.lastUsedAt = Date.now()
      tools.set(name, entry)
    },
    getSummary(): string {
      if (tools.size === 0) return ""
      const lines = ["## Tool Usage This Session"]
      for (const [name, entry] of tools) {
        const avg = Math.round(entry.totalDurationMs / entry.count)
        lines.push(`- ${name}: ${entry.count} calls, avg ${avg}ms${entry.errors > 0 ? `, ${entry.errors} errors` : ""}`)
      }
      return lines.join("\n")
    },
  }
}

/** Default per-tool timeout */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000

/**
 * Wrap a tool with per-execution timeout.
 * Inspired by OpenClaw's wrapToolWithAbortSignal cascade.
 */
export function wrapToolWithTimeout(
  tool: AgentTool,
  ctx: ToolExecutionContext
): AgentTool {
  const timeoutMs = ctx.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
  return {
    ...tool,
    execute: async (toolCallId, args) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      // Propagate parent abort signal
      if (ctx.abortSignal) {
        if (ctx.abortSignal.aborted) {
          clearTimeout(timer)
          return {
            toolCallId,
            content: [{ type: "text", text: JSON.stringify({ error: "Cancelled" }) }],
            error: "Tool execution cancelled",
          }
        }
        ctx.abortSignal.addEventListener("abort", () => {
          clearTimeout(timer)
          controller.abort()
        }, { once: true })
      }

      try {
        const result = await Promise.race([
          tool.execute(toolCallId, args),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(new Error(`Tool ${tool.name} timed out after ${timeoutMs}ms`))
            }, { once: true })
          }),
        ])
        return result
      } catch (error) {
        return {
          toolCallId,
          content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
          error: error instanceof Error ? error.message : String(error),
        }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/**
 * Apply all tool wrappers in cascade order.
 * Wrapper pipeline: metrics → logging → timeout (innermost runs first).
 */
export function applyToolWrappers(
  tool: AgentTool,
  ctx: ToolExecutionContext
): AgentTool {
  let wrapped = wrapToolWithTimeout(tool, ctx)
  wrapped = wrapToolWithLogging(wrapped)
  if (ctx.metrics) {
    wrapped = wrapToolWithMetrics(wrapped, ctx.metrics)
  }
  return wrapped
}

/**
 * Wrap a tool with execution logging.
 */
export function wrapToolWithLogging(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId, args) => {
      const start = Date.now()
      try {
        const result = await tool.execute(toolCallId, args)
        const duration = Date.now() - start
        if (duration > 5000) {
          console.warn(`[tool:${tool.name}] Slow execution: ${duration}ms`)
        }
        return result
      } catch (error) {
        const duration = Date.now() - start
        console.error(`[tool:${tool.name}] Failed after ${duration}ms:`, error instanceof Error ? error.message : error)
        throw error
      }
    },
  }
}

/**
 * Wrap a tool with metrics tracking.
 */
export function wrapToolWithMetrics(
  tool: AgentTool,
  metrics: ToolExecutionMetrics
): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId, args) => {
      const start = Date.now()
      try {
        const result = await tool.execute(toolCallId, args)
        metrics.record(tool.name, Date.now() - start, !!result.error)
        return result
      } catch (error) {
        metrics.record(tool.name, Date.now() - start, true)
        throw error
      }
    },
  }
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
