import { Effect, Ref, HashMap, Option } from "effect"
import type { ServerWebSocket } from "bun"
import type { ChatMessage } from "@bibboy/shared"
import { SessionNotFoundError } from "@bibboy/shared"
import type { ResponseStreamPayload } from "./ResponsesStreamEmitter"

// ============================================================================
// Constants
// ============================================================================

const GRACE_PERIOD_MS = 30_000 // 30 seconds
const CLEANUP_INTERVAL_MS = 10_000 // 10 seconds

// ============================================================================
// Types
// ============================================================================

export interface SessionData {
  sessionId: string
  connectedAt: number
}

interface InternalSession {
  sessionId: string
  connectedAt: number
  lastActivity: number
  messages: ChatMessage[]
  activeMessageId: string | null
  isStreaming: boolean
  disconnectedAt: number | null
  pendingNotifications: ResponseStreamPayload[]
}

interface SessionState {
  sessions: HashMap.HashMap<string, InternalSession>
  sockets: HashMap.HashMap<string, ServerWebSocket<SessionData>>
}

// ============================================================================
// Service Interface
// ============================================================================

export interface ChatSessionManagerInterface {
  readonly createSession: (
    sessionId: string
  ) => Effect.Effect<InternalSession>

  readonly getSession: (
    sessionId: string
  ) => Effect.Effect<Option.Option<InternalSession>>

  readonly updateSession: (
    sessionId: string,
    fn: (session: InternalSession) => InternalSession
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly attachSocket: (
    sessionId: string,
    ws: ServerWebSocket<SessionData>
  ) => Effect.Effect<void>

  readonly detachSocket: (
    sessionId: string
  ) => Effect.Effect<void>

  readonly send: (
    sessionId: string,
    message: ResponseStreamPayload
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly addMessage: (
    sessionId: string,
    message: ChatMessage
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly getMessages: (
    sessionId: string
  ) => Effect.Effect<readonly ChatMessage[], SessionNotFoundError>

  readonly setActiveMessage: (
    sessionId: string,
    messageId: string | null
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly setStreaming: (
    sessionId: string,
    isStreaming: boolean
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly flushPendingNotifications: (
    sessionId: string
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly cleanup: () => Effect.Effect<number>

  readonly listSessionIds: () => Effect.Effect<readonly string[]>

  readonly replaceMessages: (
    sessionId: string,
    messages: ChatMessage[]
  ) => Effect.Effect<void, SessionNotFoundError>

  readonly deleteSession: (
    sessionId: string
  ) => Effect.Effect<void>
}

// ============================================================================
// Service Implementation
// ============================================================================

export class ChatSessionManager extends Effect.Service<ChatSessionManager>()(
  "ChatSessionManager",
  {
    effect: Effect.gen(function* () {
      const stateRef = yield* Ref.make<SessionState>({
        sessions: HashMap.empty(),
        sockets: HashMap.empty(),
      })

      const createSession: ChatSessionManagerInterface["createSession"] = (
        sessionId: string
      ) =>
        Effect.gen(function* () {
          const now = Date.now()
          const session: InternalSession = {
            sessionId,
            connectedAt: now,
            lastActivity: now,
            messages: [],
            activeMessageId: null,
            isStreaming: false,
            disconnectedAt: null,
            pendingNotifications: [],
          }

          yield* Ref.update(stateRef, (state) => ({
            ...state,
            sessions: HashMap.set(state.sessions, sessionId, session),
          }))

          return session
        })

      const getSession: ChatSessionManagerInterface["getSession"] = (
        sessionId: string
      ) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          return HashMap.get(state.sessions, sessionId)
        })

      const updateSession: ChatSessionManagerInterface["updateSession"] = (
        sessionId: string,
        fn: (session: InternalSession) => InternalSession
      ) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const maybeSession = HashMap.get(state.sessions, sessionId)

          if (Option.isNone(maybeSession)) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }))
          }

          const updated = fn(maybeSession.value)
          yield* Ref.update(stateRef, (s) => ({
            ...s,
            sessions: HashMap.set(s.sessions, sessionId, updated),
          }))
        })

      const attachSocket: ChatSessionManagerInterface["attachSocket"] = (
        sessionId: string,
        ws: ServerWebSocket<SessionData>
      ) =>
        Effect.gen(function* () {
          yield* Ref.update(stateRef, (state) => ({
            ...state,
            sockets: HashMap.set(state.sockets, sessionId, ws),
          }))

          // Update session to mark as connected (ignore error if session doesn't exist)
          const maybeSession = yield* getSession(sessionId)
          if (Option.isSome(maybeSession)) {
            yield* updateSession(sessionId, (s) => ({
              ...s,
              disconnectedAt: null,
              lastActivity: Date.now(),
            })).pipe(Effect.ignore)
          }
        })

      const detachSocket: ChatSessionManagerInterface["detachSocket"] = (
        sessionId: string
      ) =>
        Effect.gen(function* () {
          yield* Ref.update(stateRef, (state) => ({
            ...state,
            sockets: HashMap.remove(state.sockets, sessionId),
          }))

          // Mark session as disconnected (start grace period)
          const maybeSession = yield* getSession(sessionId)
          if (Option.isSome(maybeSession)) {
            yield* updateSession(sessionId, (s) => ({
              ...s,
              disconnectedAt: Date.now(),
            })).pipe(Effect.ignore)
          }
        })

      const send: ChatSessionManagerInterface["send"] = (
        sessionId: string,
        message: ResponseStreamPayload
      ) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const maybeSocket = HashMap.get(state.sockets, sessionId)
          const maybeSession = HashMap.get(state.sessions, sessionId)

          if (Option.isNone(maybeSession)) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }))
          }

          if (Option.isSome(maybeSocket)) {
            // Socket connected - send directly
            const ws = maybeSocket.value
            try {
              ws.send(JSON.stringify(message))
            } catch {
              // Socket may have closed, queue the notification
              yield* updateSession(sessionId, (s) => ({
                ...s,
                pendingNotifications: [...s.pendingNotifications, message],
              }))
            }
          } else {
            // Socket disconnected - queue for later
            yield* updateSession(sessionId, (s) => ({
              ...s,
              pendingNotifications: [...s.pendingNotifications, message],
            }))
          }
        })

      const addMessage: ChatSessionManagerInterface["addMessage"] = (
        sessionId: string,
        message: ChatMessage
      ) =>
        updateSession(sessionId, (s) => ({
          ...s,
          messages: [...s.messages, message],
          lastActivity: Date.now(),
        }))

      const getMessages: ChatSessionManagerInterface["getMessages"] = (
        sessionId: string
      ) =>
        Effect.gen(function* () {
          const maybeSession = yield* getSession(sessionId)

          if (Option.isNone(maybeSession)) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }))
          }

          return maybeSession.value.messages
        })

      const setActiveMessage: ChatSessionManagerInterface["setActiveMessage"] = (
        sessionId: string,
        messageId: string | null
      ) =>
        updateSession(sessionId, (s) => ({
          ...s,
          activeMessageId: messageId,
          lastActivity: Date.now(),
        }))

      const setStreaming: ChatSessionManagerInterface["setStreaming"] = (
        sessionId: string,
        isStreaming: boolean
      ) =>
        updateSession(sessionId, (s) => ({
          ...s,
          isStreaming,
          lastActivity: Date.now(),
        }))

      const flushPendingNotifications: ChatSessionManagerInterface["flushPendingNotifications"] = (
        sessionId: string
      ) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          const maybeSession = HashMap.get(state.sessions, sessionId)
          const maybeSocket = HashMap.get(state.sockets, sessionId)

          if (Option.isNone(maybeSession)) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }))
          }

          if (Option.isNone(maybeSocket)) {
            return // No socket to flush to
          }

          const session = maybeSession.value
          const ws = maybeSocket.value

          // Send all pending notifications
          for (const notification of session.pendingNotifications) {
            try {
              ws.send(JSON.stringify(notification))
            } catch {
              // Socket closed during flush, keep remaining notifications
              return
            }
          }

          // Clear pending notifications
          yield* updateSession(sessionId, (s) => ({
            ...s,
            pendingNotifications: [],
          }))
        })

      const cleanup: ChatSessionManagerInterface["cleanup"] = () =>
        Effect.gen(function* () {
          const now = Date.now()
          const state = yield* Ref.get(stateRef)
          let removedCount = 0

          const sessionsToRemove: string[] = []

          for (const [sessionId, session] of HashMap.entries(state.sessions)) {
            // Remove sessions that have been disconnected past the grace period
            if (
              session.disconnectedAt !== null &&
              now - session.disconnectedAt > GRACE_PERIOD_MS
            ) {
              sessionsToRemove.push(sessionId)
              removedCount++
            }
          }

          if (sessionsToRemove.length > 0) {
            yield* Ref.update(stateRef, (s) => {
              let sessions = s.sessions
              let sockets = s.sockets

              for (const sessionId of sessionsToRemove) {
                sessions = HashMap.remove(sessions, sessionId)
                sockets = HashMap.remove(sockets, sessionId)
              }

              return { sessions, sockets }
            })
          }

          return removedCount
        })

      const listSessionIds: ChatSessionManagerInterface["listSessionIds"] = () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(stateRef)
          return [...HashMap.keys(state.sessions)]
        })

      const replaceMessages: ChatSessionManagerInterface["replaceMessages"] = (
        sessionId: string,
        messages: ChatMessage[]
      ) =>
        updateSession(sessionId, (s) => ({
          ...s,
          messages,
          lastActivity: Date.now(),
        }))

      const deleteSession: ChatSessionManagerInterface["deleteSession"] = (
        sessionId: string
      ) =>
        Ref.update(stateRef, (state) => ({
          sessions: HashMap.remove(state.sessions, sessionId),
          sockets: HashMap.remove(state.sockets, sessionId),
        }))

      return {
        createSession,
        getSession,
        updateSession,
        attachSocket,
        detachSocket,
        send,
        addMessage,
        getMessages,
        setActiveMessage,
        setStreaming,
        flushPendingNotifications,
        cleanup,
        listSessionIds,
        replaceMessages,
        deleteSession,
      } satisfies ChatSessionManagerInterface
    }),
  }
) {}

// ============================================================================
// Layer Export
// ============================================================================

export const ChatSessionManagerLive = ChatSessionManager.Default

// ============================================================================
// Helper: Generate Session ID
// ============================================================================

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

// ============================================================================
// Export Constants
// ============================================================================

export { GRACE_PERIOD_MS, CLEANUP_INTERVAL_MS }
