import type {
  ToolExecutionResult,
} from "@bibboy/shared"

// ============================================================================
// Types
// ============================================================================

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"

export interface ToolExecution {
  readonly id: string
  readonly name: string
  readonly arguments: Record<string, unknown>
  readonly status: "running" | "completed" | "error"
  readonly result?: ToolExecutionResult
  readonly error?: string
  readonly rawArguments?: string
  readonly startedAt?: number
}

export type JsonRecord = Record<string, unknown>

// ============================================================================
// Constants
// ============================================================================

/** Maximum reconnection attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 20

/** Initial reconnection delay in milliseconds (faster initial retry) */
const INITIAL_RECONNECT_DELAY_MS = 800

/** Maximum reconnection delay in milliseconds (higher cap for stability) */
const MAX_RECONNECT_DELAY_MS = 15000

/** Reconnection delay multiplier for exponential backoff (steeper curve) */
const RECONNECT_BACKOFF_MULTIPLIER = 1.7

// ============================================================================
// Gap Detection
// ============================================================================

export interface SequenceGap {
  expected: number
  received: number
  missedCount: number
}

/**
 * Detect sequence gaps in event streams.
 * Returns gap info if a gap exists, null otherwise.
 */
export function detectSequenceGap(
  lastSeq: number | null,
  currentSeq: number
): SequenceGap | null {
  if (lastSeq === null) {
    return null
  }
  const expected = lastSeq + 1
  if (currentSeq > expected) {
    return {
      expected,
      received: currentSeq,
      missedCount: currentSeq - expected,
    }
  }
  return null
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getDefaultWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    return "ws://localhost:3001/ws/chat"
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws/chat`
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function tryJsonParse(json: string): unknown | undefined {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

function isToolExecutionResult(value: unknown): value is ToolExecutionResult {
  if (!isJsonRecord(value)) return false
  if (typeof value.toolCallId !== "string") return false
  if (!Array.isArray(value.content)) return false
  for (const block of value.content) {
    if (!isJsonRecord(block)) return false
    if (block.type !== "text") return false
    if (typeof block.text !== "string") return false
  }
  if ("error" in value && value.error !== undefined && typeof value.error !== "string") {
    return false
  }
  return true
}

/**
 * Parse a tool result from raw output string.
 * Attempts to parse as JSON first, falls back to text content.
 */
export function parseToolResult(callId: string, output: string): ToolExecutionResult {
  const parsed = tryJsonParse(output)
  if (isToolExecutionResult(parsed)) {
    return parsed
  }

  return {
    toolCallId: callId,
    content: [{ type: "text", text: output }],
  }
}

/**
 * Safely parse JSON with fallback.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  const parsed = tryJsonParse(json)
  if (parsed === undefined) {
    return fallback
  }
  return parsed as T
}

export function safeJsonParseObject(
  json: string,
  fallback: JsonRecord = {}
): JsonRecord {
  const parsed = tryJsonParse(json)
  if (!isJsonRecord(parsed)) {
    return fallback
  }
  return parsed
}


/**
 * Calculate reconnection delay with exponential backoff.
 */
export function calculateReconnectDelay(attempt: number): number {
  return Math.min(
    INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, attempt),
    MAX_RECONNECT_DELAY_MS
  )
}
