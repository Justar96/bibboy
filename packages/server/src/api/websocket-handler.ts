import { Effect, Option, Layer, Exit, Cause, ManagedRuntime } from "effect"
import type { ServerWebSocket, Server } from "bun"
import { Schema } from "effect"
import {
  ClientMessageSchema,
  JSON_RPC_ERRORS,
  type CanvasStateSnapshotNotification,
  type SoulStateSnapshotNotification,
  type ClientMessage,
  type JsonRpcSuccessResponse,
  type JsonRpcErrorResponse,
} from "@bibboy/shared"
import {
  ChatSessionManager,
  ChatSessionManagerLive,
  generateSessionId,
  type SessionData,
} from "../services/ChatSessionManager"
import { ChatProcessor, ChatProcessorLive } from "../services/ChatProcessor"
import {
  CanvasStateService,
  CanvasStateServiceLive,
} from "../services/CanvasStateService"
import { getSoulSession, pruneSoulSessions } from "../services/SoulStateService"

// ============================================================================
// Service Layer
// ============================================================================

const SharedServicesLive = Layer.mergeAll(ChatSessionManagerLive, CanvasStateServiceLive)

const WebSocketServicesLive = Layer.mergeAll(
  SharedServicesLive,
  Layer.provide(ChatProcessorLive, SharedServicesLive)
)

// Create a managed runtime that stays alive for the lifetime of the server
const managedRuntime = ManagedRuntime.make(WebSocketServicesLive)

// Run an effect with the services runtime
const runEffect = async <A, E>(
  effect: Effect.Effect<A, E, ChatSessionManager | ChatProcessor | CanvasStateService>
): Promise<Exit.Exit<A, E>> => {
  return managedRuntime.runPromiseExit(effect)
}

// ============================================================================
// JSON-RPC Response Helpers
// ============================================================================

function createSuccessResponse(id: string, result: unknown): JsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  }
}

function createErrorResponse(
  id: string,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  }
}

// ============================================================================
// Message Parsing
// ============================================================================

const parseClientMessage = (
  data: string | Buffer
): Effect.Effect<ClientMessage, { code: number; message: string }> =>
  Effect.gen(function* () {
    const text = typeof data === "string" ? data : data.toString("utf-8")

    // Parse JSON
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return yield* Effect.fail({
        code: JSON_RPC_ERRORS.PARSE_ERROR,
        message: "Invalid JSON",
      })
    }

    // Decode with Effect Schema
    const decoded = Schema.decodeUnknownEither(ClientMessageSchema)(json)
    if (decoded._tag === "Left") {
      return yield* Effect.fail({
        code: JSON_RPC_ERRORS.INVALID_REQUEST,
        message: "Invalid request format",
      })
    }

    return decoded.right
  })

// ============================================================================
// Message Handling
// ============================================================================

const handleClientMessage = (
  ws: ServerWebSocket<SessionData>,
  message: ClientMessage
): Effect.Effect<void, never, ChatSessionManager | ChatProcessor> =>
  Effect.gen(function* () {
    const sessionId = ws.data.sessionId
    console.log(`[WebSocket] Handling ${message.method} for session ${sessionId}`)
    const chatProcessor = yield* ChatProcessor
    const sessionManager = yield* ChatSessionManager

    switch (message.method) {
      case "chat.send": {
        const result = yield* chatProcessor
          .processMessage(
            sessionId,
            message.params.message,
            message.params.agentId,
            message.params.characterState
          )
          .pipe(
            Effect.map((r) => createSuccessResponse(message.id, r)),
            Effect.catchAll((error) =>
              Effect.succeed(
                createErrorResponse(
                  message.id,
                  JSON_RPC_ERRORS.SESSION_NOT_FOUND,
                  error.sessionId
                    ? `Session not found: ${error.sessionId}`
                    : "Session error"
                )
              )
            )
          )
        ws.send(JSON.stringify(result))
        break
      }

      case "chat.cancel": {
        yield* chatProcessor.cancelMessage(sessionId).pipe(Effect.ignore)
        ws.send(
          JSON.stringify(createSuccessResponse(message.id, { cancelled: true }))
        )
        break
      }

      case "ping": {
        // Update last activity
        yield* sessionManager
          .updateSession(sessionId, (s) => ({
            ...s,
            lastActivity: Date.now(),
          }))
          .pipe(Effect.ignore)

        ws.send(
          JSON.stringify(createSuccessResponse(message.id, { pong: true }))
        )
        break
      }
    }
  })

// ============================================================================
// Bun WebSocket Handlers
// ============================================================================

export const websocketHandlers = {
  /**
   * Called when a WebSocket connection is opened
   */
  async open(ws: ServerWebSocket<SessionData>) {
    const sessionId = ws.data.sessionId
    console.log(`[WebSocket] Connection opened for session: ${sessionId}`)

    const effect = Effect.gen(function* () {
      const sessionManager = yield* ChatSessionManager
      const canvasState = yield* CanvasStateService

      // Check if session exists (reconnection)
      const maybeSession = yield* sessionManager.getSession(sessionId)

      if (Option.isSome(maybeSession)) {
        // Existing session - attach socket and flush pending notifications
        yield* sessionManager.attachSocket(sessionId, ws)
        yield* sessionManager.flushPendingNotifications(sessionId).pipe(
          Effect.ignore
        )

        // Send session resumed notification
        const session = maybeSession.value
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "session.resumed",
            params: {
              sessionId,
              messageCount: session.messages.length,
            },
          })
        )

        // Send canvas snapshot for builder rehydration if available
        const snapshot = yield* canvasState.getSnapshot(sessionId)
        if (Option.isSome(snapshot)) {
          const notification: CanvasStateSnapshotNotification = {
            jsonrpc: "2.0",
            method: "canvas.state_snapshot",
            params: {
              sessionId,
              version: snapshot.value.version,
              blueprint: snapshot.value.blueprint,
            },
          }
          ws.send(JSON.stringify(notification))
        }

        // Send soul state snapshot for rehydration if available
        const soulSession = getSoulSession(sessionId)
        if (soulSession) {
          const soulNotification: SoulStateSnapshotNotification = {
            jsonrpc: "2.0",
            method: "soul.state_snapshot",
            params: {
              sessionId,
              state: soulSession.getState(),
            },
          }
          ws.send(JSON.stringify(soulNotification))
        }
      } else {
        // New session
        console.log(`[WebSocket] Creating new session: ${sessionId}`)
        yield* sessionManager.createSession(sessionId)
        yield* sessionManager.attachSocket(sessionId, ws)
        console.log(`[WebSocket] Session created and socket attached: ${sessionId}`)
      }
    })

    const result = await runEffect(effect)
    if (Exit.isFailure(result)) {
      console.error(`[WebSocket] Error in open handler:`, Cause.pretty(result.cause))
    }
  },

  /**
   * Called when a message is received
   */
  async message(ws: ServerWebSocket<SessionData>, message: string | Buffer) {
    // Parse message
    const parseResult = await Effect.runPromiseExit(parseClientMessage(message))

    if (Exit.isFailure(parseResult)) {
      const error = Cause.failureOption(parseResult.cause)
      if (Option.isSome(error)) {
        ws.send(
          JSON.stringify(
            createErrorResponse("unknown", error.value.code, error.value.message)
          )
        )
      }
      return
    }

    const clientMessage = parseResult.value

    // Handle message with services
    const handleResult = await runEffect(handleClientMessage(ws, clientMessage))

    if (Exit.isFailure(handleResult)) {
      // Send error response
      const requestId =
        "id" in clientMessage ? String(clientMessage.id) : "unknown"
      ws.send(
        JSON.stringify(
          createErrorResponse(
            requestId,
            JSON_RPC_ERRORS.INTERNAL_ERROR,
            "Internal server error"
          )
        )
      )
    }
  },

  /**
   * Called when the WebSocket connection is closed
   */
  async close(ws: ServerWebSocket<SessionData>, _code: number, _reason: string) {
    const sessionId = ws.data.sessionId

    const effect = Effect.gen(function* () {
      const sessionManager = yield* ChatSessionManager
      yield* sessionManager.detachSocket(sessionId)
    })

    await runEffect(effect)
  },

  /**
   * Called when the WebSocket needs to handle backpressure
   */
  drain(_ws: ServerWebSocket<SessionData>) {
    // No-op for now - Bun handles backpressure internally
  },
}

// ============================================================================
// WebSocket Upgrade Handler
// ============================================================================

/**
 * Handle WebSocket upgrade requests.
 * Returns undefined if the upgrade was successful, or a Response if it failed.
 */
export function handleWebSocketUpgrade(
  request: Request,
  server: Server<SessionData>
): Response | undefined {
  const url = new URL(request.url)

  if (url.pathname !== "/ws/chat") {
    return undefined // Not a WebSocket request for our endpoint
  }

  // Get or generate session ID
  const sessionId = url.searchParams.get("sessionId") || generateSessionId()

  // Attempt upgrade
  const upgraded = server.upgrade(request, {
    data: {
      sessionId,
      connectedAt: Date.now(),
    },
  })

  if (upgraded) {
    // Upgrade successful - Bun will handle the rest
    return undefined
  }

  // Upgrade failed
  return new Response("WebSocket upgrade failed", { status: 400 })
}

// ============================================================================
// Cleanup
// ============================================================================

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * Start the session cleanup interval
 */
export function startSessionCleanup(intervalMs: number = 10_000): void {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(async () => {
    const effect = Effect.gen(function* () {
      const sessionManager = yield* ChatSessionManager
      const removed = yield* sessionManager.cleanup()
      if (removed > 0) {
        console.log(`🧹 Cleaned up ${removed} expired WebSocket sessions`)
      }

      // Keep canvas state and soul sessions aligned with live chat sessions.
      const canvasState = yield* CanvasStateService
      const activeSessionIds = yield* sessionManager.listSessionIds()
      yield* canvasState.pruneSessions(activeSessionIds)
      pruneSoulSessions(activeSessionIds)
    })

    await runEffect(effect)
  }, intervalMs)
}

/**
 * Stop the session cleanup interval
 */
export function stopSessionCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }
}

/**
 * Dispose the WebSocket services runtime
 */
export async function disposeWebSocketRuntime(): Promise<void> {
  await managedRuntime.dispose()
}

// ============================================================================
// Export Types
// ============================================================================

export type { SessionData }
