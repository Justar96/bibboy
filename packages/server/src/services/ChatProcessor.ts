import { Effect, Stream, Option, Fiber, Ref, HashMap } from "effect"
import type {
  AgentPose,
  AgentStreamEvent,
  CharacterState,
  ChatMessage,
  CompactingNotification,
  PoseChangeNotification,
} from "@bibboy/shared"
import { SessionNotFoundError } from "@bibboy/shared"
import { ChatSessionManager } from "./ChatSessionManager"
import { createAgentServiceLive } from "./AgentService"
import { createResponsesStreamEmitter, type ResponseStreamPayload } from "./ResponsesStreamEmitter"
import {
  cleanupSessionStreamingState,
  createStreamEventState,
  handleAgentStreamEvent,
} from "./chat-processor-stream-handlers"
import { maybeCompactSessionMessages } from "./chat-processor-compaction"
import { agentConfig } from "../agents/AgentConfig"
import { createToolRegistry } from "../tools"
import { extractAgentErrorMessage, extractErrorTag } from "./error-utils"
import { getGlobalConfig, getGeminiApiKeyValue } from "../config"

// ============================================================================
// Types
// ============================================================================

interface ActiveStream {
  fiber: Fiber.RuntimeFiber<void, unknown>
  messageId: string
  abortController: AbortController
  emitError: (message: string) => void
}

// ============================================================================
// Service Interface
// ============================================================================

export interface ChatProcessorInterface {
  readonly processMessage: (
    sessionId: string,
    message: string,
    agentId?: string,
    characterState?: CharacterState
  ) => Effect.Effect<{ messageId: string }, SessionNotFoundError>

  readonly cancelMessage: (
    sessionId: string
  ) => Effect.Effect<void, SessionNotFoundError>
}

// ============================================================================
// Service Implementation
// ============================================================================

export class ChatProcessor extends Effect.Service<ChatProcessor>()(
  "ChatProcessor",
  {
    effect: Effect.gen(function* () {
      const sessionManager = yield* ChatSessionManager
      // Track active streams per session for cancellation
      const activeStreamsRef = yield* Ref.make<HashMap.HashMap<string, ActiveStream>>(
        HashMap.empty()
      )

      const sendEvent = (
        sessionId: string,
        event: ResponseStreamPayload
      ): Effect.Effect<void, SessionNotFoundError> => sessionManager.send(sessionId, event)

      const processMessage: ChatProcessorInterface["processMessage"] = (
        sessionId: string,
        message: string,
        agentId?: string,
        characterState?: CharacterState
      ) =>
        Effect.gen(function* () {
          console.log(`[ChatProcessor] Processing message for session ${sessionId}`)

          // Verify session exists
          const maybeSession = yield* sessionManager.getSession(sessionId)
          if (Option.isNone(maybeSession)) {
            console.log(`[ChatProcessor] Session not found: ${sessionId}`)
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }))
          }

          const abortController = new AbortController()

          const resolvedAgentId = agentId ?? agentConfig.getDefaultAgentId()
          const resolvedAgent =
            agentConfig.getAgent(resolvedAgentId) ??
            agentConfig.getAgent(agentConfig.getDefaultAgentId())
          const model = resolvedAgent?.model.primary ?? "gemini-3-flash-preview"

          // Callback to send pose changes to the client
          const sendPoseChange = (pose: AgentPose) => {
            const notification: PoseChangeNotification = {
              jsonrpc: "2.0",
              method: "character.pose_change",
              params: { pose },
            }
            void Effect.runPromise(
              sendEvent(sessionId, notification).pipe(Effect.ignore)
            )
          }

          let sessionMessages: ChatMessage[] = []
          const toolRegistry = resolvedAgent
            ? createToolRegistry(
                resolvedAgent,
                () => sessionMessages,
                sendPoseChange,
              )
            : null
          const toolDefs = toolRegistry?.getDefinitions() ?? []
          const toolChoice = toolDefs.length > 0 ? ("auto" as const) : ("none" as const)

          const emitter = createResponsesStreamEmitter({
            model,
            emit: (event) => {
              void Effect.runPromise(sendEvent(sessionId, event).pipe(Effect.ignore))
            },
            responseExtras: {
              tool_choice: toolChoice,
              tools: toolDefs.length > 0 ? toolDefs : undefined,
            },
          })

          const messageId = emitter.responseId
          console.log(`[ChatProcessor] Created response ID: ${messageId}`)

          // Add user message to session
          const userMessage: ChatMessage = {
            id: `user_${messageId}`,
            role: "user",
            content: message,
            timestamp: Date.now(),
          }
          yield* sessionManager.addMessage(sessionId, userMessage)

          // Mark as streaming
          yield* sessionManager.setActiveMessage(sessionId, messageId)
          yield* sessionManager.setStreaming(sessionId, true)

          emitter.start()

          // Get message history for agent
          const messages = yield* sessionManager.getMessages(sessionId)
          sessionMessages = [...messages] as ChatMessage[]

          // Context compaction (delegated to helper).
          const appConfig = getGlobalConfig()
          const apiKey = getGeminiApiKeyValue(appConfig) ?? null

          const sendCompactionNotification = (
            params: CompactingNotification["params"]
          ): Effect.Effect<void, never> =>
            sendEvent(sessionId, {
              jsonrpc: "2.0",
              method: "chat.compacting",
              params,
            }).pipe(Effect.ignore)

          sessionMessages = yield* maybeCompactSessionMessages({
            sessionId,
            messageId,
            model,
            apiKey,
            sessionMessages,
            sendCompactionNotification,
            replaceSessionMessages: (messages) =>
              sessionManager.replaceMessages(sessionId, messages).pipe(Effect.ignore),
          })

          // Create agent service with session's message history
          const agentService = createAgentServiceLive(
            () => [...sessionMessages],
            agentId,
            characterState,
            sendPoseChange,
          )

          const streamState = createStreamEventState()

          // Run the agent stream
          console.log(`[ChatProcessor] Starting agent stream...`)
          const streamEffect = Effect.gen(function* () {
            // Pass full session history (excluding the current user message we just added)
            // so the model has multi-turn context
            const historyForAgent = sessionMessages.slice(0, -1)

            const stream = agentService.runStream({
              message,
              history: historyForAgent,
              agentId,
              enableTools: true,
            })

            yield* stream.pipe(
              Stream.tap((event: AgentStreamEvent) =>
                handleAgentStreamEvent({
                  event,
                  abortSignal: abortController.signal,
                  emitter,
                  sessionManager,
                  sessionId,
                  messageId,
                  state: streamState,
                })
              ),
              Stream.runDrain
            )

            if (!streamState.completed) {
              emitter.complete("completed")
            }

            yield* cleanupSessionStreamingState({
              sessionManager,
              activeStreamsRef,
              sessionId,
            })
          }).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                const errorMessage = extractAgentErrorMessage(error)
                console.error(`[ChatProcessor] Stream error [${extractErrorTag(error)}]:`, errorMessage)
                emitter.fail(errorMessage)

                yield* cleanupSessionStreamingState({
                  sessionManager,
                  activeStreamsRef,
                  sessionId,
                })
              })
            )
          )

          // Fork the stream processing
          const fiber = yield* Effect.forkDaemon(streamEffect)

          // Store the active stream
          yield* Ref.update(activeStreamsRef, (streams) =>
            HashMap.set(streams, sessionId, {
              fiber,
              messageId,
              abortController,
              emitError: (errorMessage: string) => emitter.fail(errorMessage),
            })
          )

          return { messageId }
        })

      const cancelMessage: ChatProcessorInterface["cancelMessage"] = (
        sessionId: string
      ) =>
        Effect.gen(function* () {
          // Verify session exists
          const maybeSession = yield* sessionManager.getSession(sessionId)
          if (Option.isNone(maybeSession)) {
            return yield* Effect.fail(new SessionNotFoundError({ sessionId }))
          }

          // Get active stream
          const streams = yield* Ref.get(activeStreamsRef)
          const maybeStream = HashMap.get(streams, sessionId)

          if (Option.isSome(maybeStream)) {
            const activeStream = maybeStream.value

            // Signal abort
            activeStream.abortController.abort()

            // Interrupt the fiber
            yield* Fiber.interrupt(activeStream.fiber)

            activeStream.emitError("Response cancelled")

            yield* cleanupSessionStreamingState({
              sessionManager,
              activeStreamsRef,
              sessionId,
            })
          }
        })

      return {
        processMessage,
        cancelMessage,
      } satisfies ChatProcessorInterface
    }),
    dependencies: [ChatSessionManager.Default],
  }
) {}

// ============================================================================
// Layer Export
// ============================================================================

export const ChatProcessorLive = ChatProcessor.Default
