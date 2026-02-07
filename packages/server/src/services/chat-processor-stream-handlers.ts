import { Effect, HashMap, Ref } from "effect"
import type { AgentStreamEvent, ChatMessage } from "@bibboy/shared"
import { sanitizeAssistantOutput } from "../text"
import type { ChatSessionManagerInterface } from "./ChatSessionManager"
import type { createResponsesStreamEmitter } from "./ResponsesStreamEmitter"

type ResponseStreamEmitter = ReturnType<typeof createResponsesStreamEmitter>

export interface StreamEventState {
  accumulatedContent: string
  completed: boolean
}

export function createStreamEventState(): StreamEventState {
  return {
    accumulatedContent: "",
    completed: false,
  }
}

function createAssistantMessage(params: {
  messageId: string
  content: string
}): ChatMessage {
  return {
    id: `${params.messageId}_response`,
    role: "assistant",
    content: params.content,
    timestamp: Date.now(),
  }
}

export const handleAgentStreamEvent = (params: {
  event: AgentStreamEvent
  abortSignal: AbortSignal
  emitter: ResponseStreamEmitter
  sessionManager: ChatSessionManagerInterface
  sessionId: string
  messageId: string
  state: StreamEventState
}): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    if (params.abortSignal.aborted) {
      return
    }

    switch (params.event.type) {
      case "text_delta": {
        params.state.accumulatedContent += params.event.delta
        params.emitter.addTextDelta(params.event.delta)
        return
      }

      case "tool_start": {
        params.emitter.addToolCall(
          params.event.toolCallId,
          params.event.toolName,
          params.event.arguments
        )
        return
      }

      case "tool_end": {
        params.emitter.addToolResult(
          params.event.toolCallId,
          params.event.toolName,
          params.event.result
        )
        return
      }

      case "done": {
        params.state.accumulatedContent = sanitizeAssistantOutput(
          params.event.message.content
        )
        params.emitter.complete("completed")
        params.state.completed = true

        const assistantMessage = createAssistantMessage({
          messageId: params.messageId,
          content: params.state.accumulatedContent,
        })

        yield* params.sessionManager
          .addMessage(params.sessionId, assistantMessage)
          .pipe(Effect.ignore)
        return
      }

      case "error": {
        params.emitter.fail(params.event.error)
        params.state.completed = true
      }
    }
  })

export const cleanupSessionStreamingState = <T>(params: {
  sessionManager: ChatSessionManagerInterface
  activeStreamsRef: Ref.Ref<HashMap.HashMap<string, T>>
  sessionId: string
}): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    yield* params.sessionManager
      .setActiveMessage(params.sessionId, null)
      .pipe(Effect.ignore)
    yield* params.sessionManager
      .setStreaming(params.sessionId, false)
      .pipe(Effect.ignore)

    yield* Ref.update(params.activeStreamsRef, (streams) =>
      HashMap.remove(streams, params.sessionId)
    )
  })
