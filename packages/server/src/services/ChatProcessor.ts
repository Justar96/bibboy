import { Effect, Stream, Option, Fiber, Ref, HashMap } from "effect"
import type {
  AgentPose,
  AgentStreamEvent,
  CanvasOp,
  CanvasStatePatchNotification,
  CharacterState,
  ChatMessage,
  PoseChangeNotification,
  SoulStageChangeNotification,
} from "@bibboy/shared"
import { SessionNotFoundError } from "@bibboy/shared"
import { ChatSessionManager } from "./ChatSessionManager"
import { createAgentServiceLive } from "./AgentService"
import { createResponsesStreamEmitter, type ResponseStreamPayload } from "./ResponsesStreamEmitter"
import { agentConfig } from "../agents/AgentConfig"
import { createToolRegistry } from "../tools"
import { extractAgentErrorMessage, extractErrorTag } from "./error-utils"
import { sanitizeAssistantOutput } from "../text"
import { compactIfNeeded, shouldCompact } from "./ConversationMemory"
import { getGlobalConfig, getGeminiApiKeyValue } from "../config"
import { CanvasStateService } from "./CanvasStateService"
import { getOrCreateSoulSession, type SoulStageChangeCallback } from "./SoulStateService"

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
      const canvasState = yield* CanvasStateService

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

          const canvasRuntime = {
            sessionId,
            getState: async () =>
              Effect.runPromise(canvasState.ensureSession(sessionId)),
            applyOperation: async (op: CanvasOp) =>
              Effect.runPromise(canvasState.applyOperation(sessionId, op)),
            exportBlueprint: async () =>
              Effect.runPromise(canvasState.exportBlueprint(sessionId)),
            emitPatch: (payload: CanvasStatePatchNotification["params"]) => {
              const notification: CanvasStatePatchNotification = {
                jsonrpc: "2.0",
                method: "canvas.state_patch",
                params: payload,
              }
              void Effect.runPromise(sendEvent(sessionId, notification).pipe(Effect.ignore))
            },
          }

          // Create soul evolution session with stage change callback
          const onSoulStageChange: SoulStageChangeCallback = (payload) => {
            const notification: SoulStageChangeNotification = {
              jsonrpc: "2.0",
              method: "soul.stage_change",
              params: {
                sessionId: payload.sessionId,
                stage: payload.stage,
                previousStage: payload.previousStage,
                trigger: payload.trigger,
                interactionCount: payload.interactionCount,
              },
            }
            void Effect.runPromise(
              sendEvent(sessionId, notification as unknown as ResponseStreamPayload).pipe(Effect.ignore)
            )
          }
          const soulSession = getOrCreateSoulSession(sessionId, canvasRuntime, onSoulStageChange)
          const soulRuntime = soulSession.createRuntime()

          let sessionMessages: ChatMessage[] = []
          const toolRegistry = resolvedAgent
            ? createToolRegistry(
                resolvedAgent,
                () => sessionMessages,
                sendPoseChange,
                canvasRuntime,
                soulRuntime
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

          // ── Context compaction ────────────────────────────────────
          // Estimate system prompt tokens to decide if compaction is needed.
          // We build a lightweight estimate rather than the full prompt to
          // avoid the cost of loading workspace files twice.
          const appConfig = getGlobalConfig()
          const apiKey = getGeminiApiKeyValue(appConfig) ?? null

          if (apiKey && sessionMessages.length > 0) {
            // Rough system prompt estimate — actual prompt built later in AgentService
            const systemPromptEstimate = 2000 // ~2K tokens for system prompt + tools + context

            // Check if compaction is needed before running it
            const needsCompact = shouldCompact(systemPromptEstimate, sessionMessages)

            if (needsCompact) {
              // Notify client that compaction is starting (bypass typed sendEvent)
              yield* sessionManager.send(sessionId, {
                jsonrpc: "2.0",
                method: "chat.compacting",
                params: { messageId, phase: "start" },
              } as unknown as ResponseStreamPayload).pipe(Effect.ignore)
            }

            const compactionResult = yield* Effect.tryPromise({
              try: () =>
                compactIfNeeded(
                  sessionMessages,
                  systemPromptEstimate,
                  apiKey,
                  model,
                ),
              catch: (error) => {
                console.error(`[ChatProcessor] Compaction error:`, error)
                return error instanceof Error ? error : new Error(String(error))
              },
            }).pipe(
              Effect.catchAll(() => Effect.succeed(null))
            )

            if (compactionResult?.compacted) {
              // Update session with compacted messages
              yield* sessionManager.replaceMessages(sessionId, compactionResult.messages).pipe(
                Effect.ignore
              )
              sessionMessages = compactionResult.messages
              console.log(
                `[ChatProcessor] Session ${sessionId} compacted: ` +
                `${compactionResult.messagesCompacted} messages summarized, ` +
                `~${Math.round(compactionResult.tokensBefore / 1000)}K → ` +
                `~${Math.round(compactionResult.tokensAfter / 1000)}K tokens`
              )

              // Notify client that compaction finished
              yield* sessionManager.send(sessionId, {
                jsonrpc: "2.0",
                method: "chat.compacting",
                params: {
                  messageId,
                  phase: "done",
                  messagesCompacted: compactionResult.messagesCompacted,
                },
              } as unknown as ResponseStreamPayload).pipe(Effect.ignore)
            } else if (needsCompact) {
              // Compaction was expected but didn't happen — clear the indicator
              yield* sessionManager.send(sessionId, {
                jsonrpc: "2.0",
                method: "chat.compacting",
                params: { messageId, phase: "done" },
              } as unknown as ResponseStreamPayload).pipe(Effect.ignore)
            }
          }

          // Create agent service with session's message history
          const agentService = createAgentServiceLive(
            () => [...messages] as ChatMessage[],
            agentId,
            characterState,
            sendPoseChange,
            canvasRuntime,
            soulRuntime
          )

          let accumulatedContent = ""
          let completed = false

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
                Effect.gen(function* () {
                  // Check for cancellation
                  if (abortController.signal.aborted) {
                    return
                  }

                  switch (event.type) {
                    case "text_delta": {
                      accumulatedContent += event.delta
                      emitter.addTextDelta(event.delta)
                      break
                    }

                    case "tool_start": {
                      emitter.addToolCall(event.toolCallId, event.toolName, event.arguments)
                      break
                    }

                    case "tool_end": {
                      emitter.addToolResult(event.toolCallId, event.toolName, event.result)
                      break
                    }

                    case "done": {
                      accumulatedContent = sanitizeAssistantOutput(event.message.content)
                      emitter.complete("completed")
                      completed = true

                      const assistantMessage: ChatMessage = {
                        id: `${messageId}_response`,
                        role: "assistant",
                        content: accumulatedContent,
                        timestamp: Date.now(),
                      }
                      yield* sessionManager.addMessage(sessionId, assistantMessage).pipe(
                        Effect.ignore
                      )
                      break
                    }

                    case "error": {
                      emitter.fail(event.error)
                      completed = true
                      break
                    }
                  }
                })
              ),
              Stream.runDrain
            )

            if (!completed) {
              emitter.complete("completed")
            }

            // Clear streaming state
            yield* sessionManager.setActiveMessage(sessionId, null).pipe(
              Effect.ignore
            )
            yield* sessionManager.setStreaming(sessionId, false).pipe(
              Effect.ignore
            )

            // Remove from active streams
            yield* Ref.update(activeStreamsRef, (streams) =>
              HashMap.remove(streams, sessionId)
            )
          }).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                const errorMessage = extractAgentErrorMessage(error)
                console.error(`[ChatProcessor] Stream error [${extractErrorTag(error)}]:`, errorMessage)
                emitter.fail(errorMessage)

                // Clear streaming state
                yield* sessionManager.setActiveMessage(sessionId, null).pipe(
                  Effect.ignore
                )
                yield* sessionManager.setStreaming(sessionId, false).pipe(
                  Effect.ignore
                )

                // Remove from active streams
                yield* Ref.update(activeStreamsRef, (streams) =>
                  HashMap.remove(streams, sessionId)
                )
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

            // Remove from active streams
            yield* Ref.update(activeStreamsRef, (s) =>
              HashMap.remove(s, sessionId)
            )

            yield* sessionManager.setActiveMessage(sessionId, null).pipe(
              Effect.ignore
            )
            yield* sessionManager.setStreaming(sessionId, false).pipe(
              Effect.ignore
            )
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
