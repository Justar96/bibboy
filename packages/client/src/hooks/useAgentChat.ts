import { useState, useCallback, useRef } from "react"
import type {
  ChatMessage,
  ToolCall,
  ToolExecutionResult,
  AgentResponse,
} from "@bibboy/shared"

// ============================================================================
// Types
// ============================================================================

export interface AgentChatRequest {
  message: string
  agentId?: string
  history?: ChatMessage[]
  enableTools?: boolean
}

export interface ToolExecution {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: "running" | "completed" | "error"
  result?: ToolExecutionResult
  rawArguments?: string
  startedAt?: number
}

interface AgentChatOptions {
  /** Default agent ID to use for all requests */
  agentId?: string
  onDelta?: (delta: string) => void
  onToolStart?: (tool: ToolExecution) => void
  onToolEnd?: (tool: ToolExecution) => void
  onComplete?: (message: ChatMessage, toolCalls?: readonly ToolCall[]) => void
  onError?: (error: string) => void
}

interface UseAgentChatResult {
  isStreaming: boolean
  stream: string
  activeTools: ToolExecution[]
  sendMessage: (request: AgentChatRequest) => Promise<ChatMessage | null>
  abort: () => void
}

// ============================================================================
// Responses API Event Types
// ============================================================================

/** Base event type for Responses API streaming */
type ResponsesStreamEvent =
  | ResponseCreatedEvent
  | ResponseQueuedEvent
  | ResponseInProgressEvent
  | ResponseCompletedEvent
  | OutputItemAddedEvent
  | OutputItemDoneEvent
  | ContentPartAddedEvent
  | ContentPartDoneEvent
  | OutputTextDeltaEvent
  | OutputTextDoneEvent
  | OutputTextAnnotationAddedEvent
  | RefusalDeltaEvent
  | RefusalDoneEvent
  | FunctionCallArgumentsDeltaEvent
  | FunctionCallArgumentsDoneEvent
  | ErrorEvent

interface ResponseCreatedEvent {
  type: "response.created"
  response: ResponseObject
  sequence_number: number
}

interface ResponseQueuedEvent {
  type: "response.queued"
  response: ResponseObject
  sequence_number: number
}

interface ResponseInProgressEvent {
  type: "response.in_progress"
  response: ResponseObject
  sequence_number: number
}

interface ResponseCompletedEvent {
  type: "response.completed"
  response: ResponseObject
  sequence_number: number
}

interface OutputItemAddedEvent {
  type: "response.output_item.added"
  output_index: number
  item: OutputItem
  sequence_number: number
}

interface OutputItemDoneEvent {
  type: "response.output_item.done"
  output_index: number
  item: OutputItem
  sequence_number: number
}

interface ContentPartAddedEvent {
  type: "response.content_part.added"
  item_id: string
  output_index: number
  content_index: number
  part: ContentPart
  sequence_number: number
}

interface ContentPartDoneEvent {
  type: "response.content_part.done"
  item_id: string
  output_index: number
  content_index: number
  part: ContentPart
  sequence_number: number
}

interface OutputTextDeltaEvent {
  type: "response.output_text.delta"
  item_id: string
  output_index: number
  content_index: number
  delta: string
  sequence_number: number
}

interface OutputTextDoneEvent {
  type: "response.output_text.done"
  item_id: string
  output_index: number
  content_index: number
  text: string
  sequence_number: number
}

interface OutputTextAnnotationAddedEvent {
  type: "response.output_text.annotation.added"
  item_id: string
  output_index: number
  content_index: number
  annotation_index: number
  annotation: unknown
  sequence_number: number
}

interface RefusalDeltaEvent {
  type: "response.refusal.delta"
  item_id: string
  output_index: number
  content_index: number
  delta: string
  sequence_number: number
}

interface RefusalDoneEvent {
  type: "response.refusal.done"
  item_id: string
  output_index: number
  content_index: number
  refusal: string
  sequence_number: number
}

interface FunctionCallArgumentsDeltaEvent {
  type: "response.function_call_arguments.delta"
  item_id: string
  output_index: number
  delta: string
  sequence_number: number
}

interface FunctionCallArgumentsDoneEvent {
  type: "response.function_call_arguments.done"
  item_id: string
  name: string
  output_index: number
  arguments: string
  sequence_number: number
}

interface ErrorEvent {
  type: "error"
  error: { code: string; message: string }
}

interface ResponseObject {
  id: string
  object: "response"
  created_at: number
  status: "queued" | "in_progress" | "completed" | "failed" | "incomplete" | "cancelled"
  completed_at?: number
  model: string
  output: OutputItem[]
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

interface OutputItem {
  id: string
  type: "message" | "function_call" | "function_call_output"
  status?: "in_progress" | "completed"
  role?: "assistant"
  content?: ContentPart[]
  name?: string
  call_id?: string
  arguments?: string
  output?: string
}

interface ContentPart {
  type: "output_text" | "refusal" | "reasoning_text"
  text?: string
  refusal?: string
  annotations?: unknown[]
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for handling agent chat with tool execution.
 * Uses SSE streaming with tool start/end events.
 */
export function useAgentChat(options: AgentChatOptions = {}): UseAgentChatResult {
  const [isStreaming, setIsStreaming] = useState(false)
  const [stream, setStream] = useState("")
  const [activeTools, setActiveTools] = useState<ToolExecution[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
    setStream("")
    setActiveTools([])
  }, [])

  const parseToolResult = useCallback(
    (callId: string, output: string): ToolExecutionResult => {
      try {
        const parsed = JSON.parse(output) as ToolExecutionResult
        if (parsed && typeof parsed === "object" && parsed.toolCallId) {
          return parsed
        }
      } catch {
        // fall through
      }
      return {
        toolCallId: callId,
        content: [{ type: "text", text: output }],
      }
    },
    []
  )

  const sendMessage = useCallback(
    async (request: AgentChatRequest): Promise<ChatMessage | null> => {
      // Abort any existing stream
      abort()

      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsStreaming(true)
      setStream("")
      setActiveTools([])

      try {
        // Use request-level agentId or fallback to hook-level default
        const agentId = request.agentId ?? options.agentId
        
        // In development, connect directly to backend for SSE to bypass Vite proxy issues
        const streamUrl = import.meta.env.DEV 
          ? "http://localhost:3001/api/agent/stream"
          : "/api/agent/stream"
        
        const response = await fetch(streamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: request.message,
            agentId,
            history: request.history,
            enableTools: request.enableTools ?? true,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Agent request failed: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error("No response body")
        }

        const decoder = new TextDecoder()
        let buffer = ""
        let fullContent = ""
        let finalMessage: ChatMessage | null = null
        let responseId = ""
        const toolsMap = new Map<string, ToolExecution>()
        const pendingFunctionCalls = new Map<string, { id: string; name: string; call_id: string; arguments: string }>()
        const allToolCalls: ToolCall[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data: ")) continue
            
            const data = trimmed.slice(6)
            
            // Handle [DONE] marker
            if (data === "[DONE]") {
              continue
            }

            try {
              const event = JSON.parse(data) as ResponsesStreamEvent
              const eventType = event.type

              // Handle response lifecycle events
              if (eventType === "response.created" || eventType === "response.in_progress") {
                responseId = (event as ResponseCreatedEvent).response.id
              }

              // Handle text delta
              if (eventType === "response.output_text.delta") {
                const delta = (event as OutputTextDeltaEvent).delta
                fullContent += delta
                setStream(fullContent)
                options.onDelta?.(delta)
              }

              if (eventType === "response.output_text.done") {
                const doneText = (event as OutputTextDoneEvent).text
                fullContent = doneText
                setStream(fullContent)
              }

              if (eventType === "response.refusal.delta") {
                const delta = (event as RefusalDeltaEvent).delta
                fullContent += delta
                setStream(fullContent)
                options.onDelta?.(delta)
              }

              if (eventType === "response.refusal.done") {
                const refusalText = (event as RefusalDoneEvent).refusal
                fullContent = refusalText
                setStream(fullContent)
              }

              // Handle new function call output item
              if (eventType === "response.output_item.added") {
                const item = (event as OutputItemAddedEvent).item
                if (item.type === "function_call" && item.name && item.call_id) {
                  pendingFunctionCalls.set(item.id, {
                    id: item.id,
                    name: item.name,
                    call_id: item.call_id,
                    arguments: item.arguments ?? "",
                  })
                  
                  // Emit tool start
                  const tool: ToolExecution = {
                    id: item.call_id,
                    name: item.name,
                    arguments: {},
                    status: "running",
                    rawArguments: item.arguments ?? "",
                    startedAt: Date.now(),
                  }
                  toolsMap.set(item.call_id, tool)
                  setActiveTools(Array.from(toolsMap.values()))
                  options.onToolStart?.(tool)
                } else if (item.type === "function_call_output" && item.call_id && item.output) {
                  const result = parseToolResult(item.call_id, item.output)
                  const existing = toolsMap.get(item.call_id)
                  if (existing) {
                    existing.status = result.error ? "error" : "completed"
                    existing.result = result
                    setActiveTools(Array.from(toolsMap.values()))
                    options.onToolEnd?.(existing)
                  }
                }
              }

              // Handle function call arguments delta
              if (eventType === "response.function_call_arguments.delta") {
                const deltaEvent = event as FunctionCallArgumentsDeltaEvent
                const existing = pendingFunctionCalls.get(deltaEvent.item_id)
                if (existing) {
                  existing.arguments += deltaEvent.delta
                  const tool = toolsMap.get(existing.call_id)
                  if (tool) {
                    tool.rawArguments = existing.arguments
                    try {
                      tool.arguments = JSON.parse(existing.arguments) as Record<string, unknown>
                    } catch {
                      // Ignore until valid JSON
                    }
                    setActiveTools(Array.from(toolsMap.values()))
                  }
                }
              }

              if (eventType === "response.function_call_arguments.done") {
                const doneEvent = event as FunctionCallArgumentsDoneEvent
                const existing = pendingFunctionCalls.get(doneEvent.item_id)
                if (existing) {
                  existing.arguments = doneEvent.arguments
                  const tool = toolsMap.get(existing.call_id)
                  if (tool) {
                    try {
                      tool.arguments = JSON.parse(doneEvent.arguments) as Record<string, unknown>
                      setActiveTools(Array.from(toolsMap.values()))
                    } catch {
                      // Ignore invalid JSON
                    }
                  }
                }
              }

              // Handle response completion
              if (eventType === "response.completed") {
                const completedEvent = event as ResponseCompletedEvent
                const response = completedEvent.response

                // Finalize any pending function calls
                for (const [, fc] of pendingFunctionCalls) {
                  let args: Record<string, unknown> = {}
                  try {
                    args = JSON.parse(fc.arguments) as Record<string, unknown>
                  } catch {
                    args = {}
                  }
                  allToolCalls.push({ id: fc.call_id, name: fc.name, arguments: args })
                  
                  // Update tool execution with parsed args
                  const existing = toolsMap.get(fc.call_id)
                  if (existing) {
                    existing.arguments = args
                    setActiveTools(Array.from(toolsMap.values()))
                  }
                }

                // Extract final message content from response output
                let messageContent = fullContent
                for (const item of response.output) {
                  if (item.type === "message" && item.content) {
                    for (const part of item.content) {
                      if (part.type === "output_text" && part.text) {
                        messageContent = part.text
                      }
                      if (part.type === "refusal" && part.refusal) {
                        messageContent = part.refusal
                      }
                    }
                  }
                }

                finalMessage = {
                  id: responseId || `msg_${Date.now()}`,
                  role: "assistant",
                  content: messageContent,
                  timestamp: Date.now(),
                }

                options.onComplete?.(finalMessage, allToolCalls.length > 0 ? allToolCalls : undefined)
              }

              // Handle error event
              if (eventType === "error") {
                const errorEvent = event as ErrorEvent
                const errorMessage = 
                  errorEvent.error?.message ?? 
                  (event as { message?: string }).message ?? 
                  "Unknown error"
                throw new Error(errorMessage)
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) continue
              throw parseError
            }
          }
        }

        // If stream ended without response.completed, create message from accumulated content
        if (!finalMessage && fullContent) {
          finalMessage = {
            id: responseId || `msg_${Date.now()}`,
            role: "assistant",
            content: fullContent,
            timestamp: Date.now(),
          }
          options.onComplete?.(finalMessage, allToolCalls.length > 0 ? allToolCalls : undefined)
        }

        setIsStreaming(false)
        setStream("")
        return finalMessage
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return null
        }

        // Try fallback to non-streaming
        console.warn("Agent streaming failed, trying non-streaming:", error)
        setStream("")

        try {
          const response = await fetch("/api/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: request.message,
              history: request.history,
              enableTools: request.enableTools ?? true,
            }),
            signal: controller.signal,
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            const errorMessage = 
              errorData.error?.message ?? 
              errorData.error ?? 
              `Request failed: ${response.status}`
            throw new Error(errorMessage)
          }

          // Parse AgentResponse format
          const data = await response.json() as AgentResponse

          const finalMessage: ChatMessage = {
            id: data.message.id ?? `msg_${Date.now()}`,
            role: "assistant",
            content: data.message.content,
            timestamp: data.message.timestamp ?? Date.now(),
          }

          const extractedToolCalls = data.toolCalls ?? []

          options.onComplete?.(finalMessage, extractedToolCalls.length > 0 ? extractedToolCalls : undefined)
          setIsStreaming(false)
          return finalMessage
        } catch (fallbackError) {
          const errorMessage = fallbackError instanceof Error ? fallbackError.message : "Unknown error"
          options.onError?.(errorMessage)
          setIsStreaming(false)
          return null
        }
      } finally {
        abortControllerRef.current = null
      }
    },
    [abort, options, parseToolResult]
  )

  return {
    isStreaming,
    stream,
    activeTools,
    sendMessage,
    abort,
  }
}
