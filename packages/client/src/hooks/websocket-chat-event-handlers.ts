import type {
  ChatMessage,
  TypingState,
  AgentPose,
  CanvasCharacterBlueprint,
  CanvasOp,
} from "@bibboy/shared"
import { isAgentPose } from "@bibboy/shared"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type { ToolExecution, JsonRecord } from "./websocket-chat-utils"
import {
  parseToolResult,
  safeJsonParseObject,
  isJsonRecord,
} from "./websocket-chat-utils"
import {
  extractAssistantMessageContent,
  extractEventErrorMessage,
  parseCanvasPatch,
  parseCanvasSnapshot,
  readNumber,
  readString,
} from "./websocket-chat-parsers"

type EventHandler = (payload: JsonRecord) => void
type ResponseEventHandlers = Record<string, EventHandler>
type NotificationHandlers = Record<string, EventHandler>

interface ResponseEventHandlerDeps {
  startThinking: () => void
  stopTypingAndResetStreamingState: () => void
  onErrorRef: MutableRefObject<((error: Error) => void) | undefined>
  toolItemToCallIdRef: MutableRefObject<Map<string, string>>
  toolArgsRef: MutableRefObject<Map<string, string>>
  streamingContentRef: MutableRefObject<string>
  setIsTyping: Dispatch<SetStateAction<boolean>>
  setTypingState: Dispatch<SetStateAction<TypingState | null>>
  setStreamingContent: Dispatch<SetStateAction<string>>
  setActiveTools: Dispatch<SetStateAction<ToolExecution[]>>
  setActiveMessageId: Dispatch<SetStateAction<string | null>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  /** Optional: Throttled tool stream callbacks (when provided, used in parallel with setActiveTools) */
  onToolStart?: (toolCallId: string, name: string, args: unknown, rawArguments?: string) => void
  onToolArgsUpdate?: (toolCallId: string, args: unknown, rawArguments?: string) => void
  onToolComplete?: (toolCallId: string, output: unknown, isError?: boolean) => void
}

interface NotificationHandlerDeps {
  reconnectAttemptsRef: MutableRefObject<number>
  onSessionResumedRef: MutableRefObject<((messageCount: number) => void) | undefined>
  setIsCompacting: Dispatch<SetStateAction<boolean>>
  setPendingPoseChange: Dispatch<SetStateAction<AgentPose | null>>
  setCanvasVersion: Dispatch<SetStateAction<number | null>>
  setCanvasBlueprint: Dispatch<SetStateAction<CanvasCharacterBlueprint | null>>
  setLastCanvasOp: Dispatch<SetStateAction<CanvasOp | null>>
}

export function createResponseEventHandlers(
  deps: ResponseEventHandlerDeps
): ResponseEventHandlers {
  return {
    "response.created": (data) => {
      const response = isJsonRecord(data.response) ? data.response : null
      const activeId = response ? readString(response.id) : null
      deps.startThinking()
      if (activeId) {
        deps.setActiveMessageId(activeId)
      }
    },
    "response.queued": () => {
      deps.startThinking()
    },
    "response.in_progress": () => {
      deps.setIsTyping(true)
      deps.setTypingState("streaming")
    },
    "response.output_text.delta": (data) => {
      const delta = readString(data.delta)
      if (delta !== null) {
        deps.setStreamingContent((prev) => prev + delta)
      }
    },
    "response.output_text.done": (data) => {
      const text = readString(data.text)
      if (text !== null) {
        deps.setStreamingContent(text)
      }
    },
    "response.refusal.delta": (data) => {
      const delta = readString(data.delta)
      if (delta !== null) {
        deps.setStreamingContent((prev) => prev + delta)
      }
    },
    "response.refusal.done": (data) => {
      const refusal = readString(data.refusal)
      if (refusal !== null) {
        deps.setStreamingContent(refusal)
      }
    },
    "response.output_item.added": (data) => {
      const item = isJsonRecord(data.item) ? data.item : null
      const itemType = item ? readString(item.type) : null

      if (item && itemType === "function_call") {
        const itemId = readString(item.id)
        const callId = readString(item.call_id)
        const toolName = readString(item.name)
        const rawArguments = readString(item.arguments) ?? "{}"

        if (!itemId || !callId || !toolName) {
          return
        }
        deps.toolItemToCallIdRef.current.set(itemId, callId)
        deps.toolArgsRef.current.set(itemId, rawArguments)

        deps.setTypingState("tool_executing")
        const parsedArgs = safeJsonParseObject(rawArguments, {})
        deps.setActiveTools((prev) => [
          ...prev,
          {
            id: callId,
            name: toolName,
            arguments: parsedArgs,
            status: "running",
            rawArguments,
            startedAt: Date.now(),
          },
        ])
        // Also notify throttled tool stream if callback provided
        deps.onToolStart?.(callId, toolName, parsedArgs, rawArguments)
        return
      }

      if (item && itemType === "function_call_output") {
        const callId = readString(item.call_id)
        const output = readString(item.output)
        if (!callId || output === null) {
          return
        }
        const result = parseToolResult(callId, output)
        const isError = Boolean(result.error)
        deps.setActiveTools((prev) =>
          prev.map((t) =>
            t.id === callId
              ? {
                  ...t,
                  status: isError ? "error" : "completed",
                  result,
                  error: result.error,
                }
              : t
          )
        )
        // Also notify throttled tool stream if callback provided
        deps.onToolComplete?.(callId, output, isError)
      }
    },
    "response.function_call_arguments.delta": (data) => {
      const itemId = readString(data.item_id)
      const delta = readString(data.delta)
      if (!itemId || delta === null) {
        return
      }

      const callId = deps.toolItemToCallIdRef.current.get(itemId)
      if (callId) {
        const existingArgs = deps.toolArgsRef.current.get(itemId) ?? ""
        const nextArgs = existingArgs + delta
        deps.toolArgsRef.current.set(itemId, nextArgs)
        const parsedArgs = safeJsonParseObject(nextArgs, {})
        deps.setActiveTools((prev) =>
          prev.map((t) =>
            t.id === callId
              ? {
                  ...t,
                  rawArguments: nextArgs,
                  arguments: parsedArgs,
                }
              : t
          )
        )
        // Also notify throttled tool stream if callback provided
        deps.onToolArgsUpdate?.(callId, parsedArgs, nextArgs)
      }
    },
    "response.function_call_arguments.done": (data) => {
      const itemId = readString(data.item_id)
      const argumentsJson = readString(data.arguments)
      if (!itemId || argumentsJson === null) {
        return
      }

      const callId = deps.toolItemToCallIdRef.current.get(itemId)
      if (callId) {
        deps.toolArgsRef.current.set(itemId, argumentsJson)
        const parsedArgs = safeJsonParseObject(argumentsJson, {})
        deps.setActiveTools((prev) =>
          prev.map((t) =>
            t.id === callId
              ? {
                  ...t,
                  rawArguments: argumentsJson,
                  arguments: parsedArgs,
                }
              : t
          )
        )
        // Also notify throttled tool stream if callback provided
        deps.onToolArgsUpdate?.(callId, parsedArgs, argumentsJson)
      }
    },
    "response.completed": (data) => {
      const response = isJsonRecord(data.response) ? data.response : null
      const completedId = response ? readString(response.id) : null
      const messageContent = extractAssistantMessageContent(
        response?.output,
        deps.streamingContentRef.current
      )

      if (completedId) {
        deps.setMessages((prev) => [
          ...prev,
          {
            id: completedId,
            role: "assistant",
            content: messageContent,
            timestamp: Date.now(),
          },
        ])
      }

      deps.stopTypingAndResetStreamingState()
    },
    "response.failed": (data) => {
      const errorMessage = extractEventErrorMessage(
        isJsonRecord(data.response) ? data.response : {},
        "Response failed"
      )
      deps.onErrorRef.current?.(new Error(errorMessage))
      deps.stopTypingAndResetStreamingState()
    },
    error: (data) => {
      const message = extractEventErrorMessage(data, "Response stream error")
      deps.onErrorRef.current?.(new Error(message))
      deps.stopTypingAndResetStreamingState()
    },
  }
}

export function createNotificationHandlers(
  deps: NotificationHandlerDeps
): NotificationHandlers {
  return {
    "session.resumed": (params) => {
      const messageCount = readNumber(params.messageCount)
      if (messageCount !== null) {
        deps.reconnectAttemptsRef.current = 0
        deps.onSessionResumedRef.current?.(messageCount)
      }
    },
    "chat.compacting": (params) => {
      const phase = readString(params.phase)
      if (phase === "start" || phase === "done") {
        deps.setIsCompacting(phase === "start")
      }
    },
    "character.pose_change": (params) => {
      const pose = params.pose
      if (typeof pose === "string" && isAgentPose(pose)) {
        deps.setPendingPoseChange(pose)
      }
    },
    "canvas.state_snapshot": (params) => {
      const snapshot = parseCanvasSnapshot(params)
      if (snapshot) {
        deps.setCanvasVersion(snapshot.version)
        deps.setCanvasBlueprint(snapshot.blueprint)
        deps.setLastCanvasOp(null)
      }
    },
    "canvas.state_patch": (params) => {
      const patch = parseCanvasPatch(params)
      if (patch) {
        deps.setCanvasVersion(patch.version)
        deps.setCanvasBlueprint(patch.blueprint)
        deps.setLastCanvasOp(patch.op)
      }
    },
  }
}
