import { useState, useCallback, useRef } from "react"
import type {
  ChatMessage,
  ToolCall,
  ToolExecutionResult,
  AgentResponse,
} from "@bibboy/shared"
import {
  isJsonRecord,
  parseToolResult,
  safeJsonParseObject,
} from "./websocket-chat-utils"
import { extractAssistantMessageContent } from "./websocket-chat-parsers"
import { parseHandledResponsesStreamEvent } from "./responses-stream-events"

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
              const event = parseHandledResponsesStreamEvent(data)
              if (!event) {
                continue
              }
              switch (event.type) {
                case "response.created":
                case "response.in_progress":
                  responseId = event.response.id
                  break
                case "response.output_text.delta":
                  fullContent += event.delta
                  setStream(fullContent)
                  options.onDelta?.(event.delta)
                  break
                case "response.output_text.done":
                  fullContent = event.text
                  setStream(fullContent)
                  break
                case "response.refusal.delta":
                  fullContent += event.delta
                  setStream(fullContent)
                  options.onDelta?.(event.delta)
                  break
                case "response.refusal.done":
                  fullContent = event.refusal
                  setStream(fullContent)
                  break
                case "response.output_item.added":
                  if (event.item.type === "function_call") {
                    pendingFunctionCalls.set(event.item.id, {
                      id: event.item.id,
                      name: event.item.name,
                      call_id: event.item.call_id,
                      arguments: event.item.arguments,
                    })

                    // Emit tool start
                    const tool: ToolExecution = {
                      id: event.item.call_id,
                      name: event.item.name,
                      arguments: {},
                      status: "running",
                      rawArguments: event.item.arguments,
                      startedAt: Date.now(),
                    }
                    toolsMap.set(event.item.call_id, tool)
                    setActiveTools(Array.from(toolsMap.values()))
                    options.onToolStart?.(tool)
                  } else if (event.item.type === "function_call_output") {
                    const result = parseToolResult(event.item.call_id, event.item.output)
                    const existing = toolsMap.get(event.item.call_id)
                    if (existing) {
                      existing.status = result.error ? "error" : "completed"
                      existing.result = result
                      setActiveTools(Array.from(toolsMap.values()))
                      options.onToolEnd?.(existing)
                    }
                  }
                  break
                case "response.function_call_arguments.delta": {
                  const existing = pendingFunctionCalls.get(event.item_id)
                  if (existing) {
                    existing.arguments += event.delta
                    const tool = toolsMap.get(existing.call_id)
                    if (tool) {
                      tool.rawArguments = existing.arguments
                      tool.arguments = safeJsonParseObject(existing.arguments, tool.arguments)
                      setActiveTools(Array.from(toolsMap.values()))
                    }
                  }
                  break
                }
                case "response.function_call_arguments.done": {
                  const existing = pendingFunctionCalls.get(event.item_id)
                  if (existing) {
                    existing.arguments = event.arguments
                    const tool = toolsMap.get(existing.call_id)
                    if (tool) {
                      tool.arguments = safeJsonParseObject(event.arguments, tool.arguments)
                      setActiveTools(Array.from(toolsMap.values()))
                    }
                  }
                  break
                }
                case "response.completed": {
                  const response = event.response

                  // Finalize any pending function calls
                  for (const [, fc] of pendingFunctionCalls) {
                    const args = safeJsonParseObject(fc.arguments)
                    allToolCalls.push({ id: fc.call_id, name: fc.name, arguments: args })

                    // Update tool execution with parsed args
                    const existing = toolsMap.get(fc.call_id)
                    if (existing) {
                      existing.arguments = args
                      setActiveTools(Array.from(toolsMap.values()))
                    }
                  }

                  const messageContent = extractAssistantMessageContent(response.output, fullContent)

                  finalMessage = {
                    id: responseId || `msg_${Date.now()}`,
                    role: "assistant",
                    content: messageContent,
                    timestamp: Date.now(),
                  }

                  options.onComplete?.(finalMessage, allToolCalls.length > 0 ? allToolCalls : undefined)
                  break
                }
                case "response.failed":
                  throw new Error(event.response.error?.message ?? "Model response failed")
                case "error":
                  throw new Error(event.error.message)
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
        if (error instanceof Error && error.name === "AbortError") {
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
          const data = await response.json()
          if (!isJsonRecord(data) || !isJsonRecord(data.message)) {
            throw new Error("Invalid agent response payload")
          }
          const parsedData = data as AgentResponse

          const finalMessage: ChatMessage = {
            id: parsedData.message.id ?? `msg_${Date.now()}`,
            role: "assistant",
            content: parsedData.message.content,
            timestamp: parsedData.message.timestamp ?? Date.now(),
          }

          const extractedToolCalls = parsedData.toolCalls ?? []

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
    [abort, options]
  )

  return {
    isStreaming,
    stream,
    activeTools,
    sendMessage,
    abort,
  }
}
