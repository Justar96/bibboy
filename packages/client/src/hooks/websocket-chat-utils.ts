import type {
  CanvasCharacterBlueprint,
  CanvasOp,
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

// ============================================================================
// Constants
// ============================================================================

/** Maximum reconnection attempts before giving up (~30 seconds with backoff) */
export const MAX_RECONNECT_ATTEMPTS = 15

/** Initial reconnection delay in milliseconds */
const INITIAL_RECONNECT_DELAY_MS = 2000

/** Maximum reconnection delay in milliseconds */
const MAX_RECONNECT_DELAY_MS = 5000

/** Reconnection delay multiplier for exponential backoff */
const RECONNECT_BACKOFF_MULTIPLIER = 1.2

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

/**
 * Parse a tool result from raw output string.
 * Attempts to parse as JSON first, falls back to text content.
 */
export function parseToolResult(callId: string, output: string): ToolExecutionResult {
  try {
    const parsed = JSON.parse(output) as ToolExecutionResult
    if (parsed && typeof parsed === "object" && parsed.toolCallId) {
      return parsed
    }
  } catch {
    // fall through to default
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
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function isLayerShape(value: unknown): value is { variant: string; color: string } {
  if (!value || typeof value !== "object") return false
  const layer = value as { variant?: unknown; color?: unknown }
  return typeof layer.variant === "string" && typeof layer.color === "string"
}

export function isCanvasBlueprint(value: unknown): value is CanvasCharacterBlueprint {
  if (!value || typeof value !== "object") return false
  const data = value as {
    entityId?: unknown
    palettePreset?: unknown
    pose?: unknown
    animation?: unknown
    layers?: unknown
  }
  if (
    typeof data.entityId !== "string" ||
    typeof data.palettePreset !== "string" ||
    typeof data.pose !== "string" ||
    typeof data.animation !== "string"
  ) {
    return false
  }
  const layers = data.layers as {
    body?: unknown
    hair?: unknown
    eyes?: unknown
    outfit?: unknown
    accessory?: unknown
  } | undefined
  return Boolean(
    layers &&
    isLayerShape(layers.body) &&
    isLayerShape(layers.hair) &&
    isLayerShape(layers.eyes) &&
    isLayerShape(layers.outfit) &&
    isLayerShape(layers.accessory)
  )
}

export function isCanvasOp(value: unknown): value is CanvasOp {
  if (!value || typeof value !== "object") return false
  const op = value as { type?: unknown }
  return typeof op.type === "string"
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
