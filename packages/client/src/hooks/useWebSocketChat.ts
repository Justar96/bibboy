import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import {
  isAgentPose,
  type AgentPose,
  type CanvasCharacterBlueprint,
  type CanvasOp,
  type CharacterState,
  type ChatMessage,
  type JsonRpcSuccessResponse,
  type JsonRpcErrorResponse,
  type TypingState,
  type ResponseStreamEvent,
  type SoulState,
  type SoulStage,
} from "@bibboy/shared"
import {
  getDefaultWebSocketUrl,
  generateSessionId,
  parseToolResult,
  safeJsonParse,
  isCanvasBlueprint,
  isCanvasOp,
  calculateReconnectDelay,
  MAX_RECONNECT_ATTEMPTS,
  type ConnectionState,
  type ToolExecution,
} from "./websocket-chat-utils"

// Re-export types for consumers
export type { ConnectionState, ToolExecution } from "./websocket-chat-utils"

export interface UseWebSocketChatOptions {
  /** WebSocket URL (defaults to auto-detect based on environment) */
  readonly url?: string
  /** Agent ID to use for chat */
  readonly agentId?: string
  /** Auto-connect on mount */
  readonly autoConnect?: boolean
  /** Callback when connection is established */
  readonly onConnect?: () => void
  /** Callback when connection is lost */
  readonly onDisconnect?: () => void
  /** Callback when an error occurs */
  readonly onError?: (error: Error) => void
  /** Callback when session is resumed after reconnect */
  readonly onSessionResumed?: (messageCount: number) => void
}

export interface UseWebSocketChatReturn {
  /** Current connection state */
  readonly connectionState: ConnectionState
  /** Establish WebSocket connection */
  readonly connect: () => void
  /** Close WebSocket connection */
  readonly disconnect: () => void
  /** Chat message history */
  readonly messages: ChatMessage[]
  /** Send a message to the agent */
  readonly sendMessage: (text: string, characterState?: CharacterState) => Promise<string>
  /** Cancel the current message generation */
  readonly cancelMessage: () => void
  /** Whether the agent is currently typing/processing */
  readonly isTyping: boolean
  /** Current typing state (thinking, tool_executing, streaming) */
  readonly typingState: TypingState | null
  /** Current streaming content (partial response) */
  readonly streamingContent: string
  /** Active tool executions */
  readonly activeTools: ToolExecution[]
  /** Clear all messages */
  readonly clearMessages: () => void
  /** Current message ID being processed */
  readonly activeMessageId: string | null
  /** Whether context compaction is in progress */
  readonly isCompacting: boolean
  /** Pending pose change from agent */
  readonly pendingPoseChange: AgentPose | null
  /** Clear the pending pose change */
  readonly clearPoseChange: () => void
  /** Latest canvas blueprint from realtime builder notifications */
  readonly canvasBlueprint: CanvasCharacterBlueprint | null
  /** Version for the latest canvas blueprint */
  readonly canvasVersion: number | null
  /** Last applied canvas operation */
  readonly lastCanvasOp: CanvasOp | null
  /** Current soul evolution state */
  readonly soulState: SoulState | null
  /** Current soul evolution stage (convenience shortcut) */
  readonly soulStage: SoulStage | null
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWebSocketChat(
  options: UseWebSocketChatOptions = {}
): UseWebSocketChatReturn {
  const {
    url,
    agentId,
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
    onSessionResumed,
  } = options

  // Stable refs for callbacks to avoid re-creating handleMessage/connect on every render
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const onErrorRef = useRef(onError)
  const onSessionResumedRef = useRef(onSessionResumed)
  useEffect(() => { onConnectRef.current = onConnect }, [onConnect])
  useEffect(() => { onDisconnectRef.current = onDisconnect }, [onDisconnect])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onSessionResumedRef.current = onSessionResumed }, [onSessionResumed])

  // State
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [typingState, setTypingState] = useState<TypingState | null>(null)
  const [streamingContent, setStreamingContent] = useState("")
  const [activeTools, setActiveTools] = useState<ToolExecution[]>([])
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [isCompacting, setIsCompacting] = useState(false)
  const [pendingPoseChange, setPendingPoseChange] = useState<AgentPose | null>(null)
  const [canvasBlueprint, setCanvasBlueprint] = useState<CanvasCharacterBlueprint | null>(null)
  const [canvasVersion, setCanvasVersion] = useState<number | null>(null)
  const [lastCanvasOp, setLastCanvasOp] = useState<CanvasOp | null>(null)
  const [soulState, setSoulState] = useState<SoulState | null>(null)
  const [soulStage, setSoulStage] = useState<SoulStage | null>(null)

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const connectionIdRef = useRef(0) // Tracks current connection to ignore stale events
  const pendingRequestsRef = useRef<
    Map<
      string,
      {
        resolve: (value: unknown) => void
        reject: (error: Error) => void
      }
    >
  >(new Map())
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isUnmountingRef = useRef(false) // Track intentional cleanup vs connection loss
  const toolArgsRef = useRef<Map<string, string>>(new Map())
  const toolItemToCallIdRef = useRef<Map<string, string>>(new Map())
  // Ref to hold latest streamingContent for use in handleMessage
  const streamingContentRef = useRef("")
  
  // Keep ref in sync with state
  useEffect(() => {
    streamingContentRef.current = streamingContent
  }, [streamingContent])

  // Get or create session ID
  const getSessionId = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = generateSessionId()
    }
    return sessionIdRef.current
  }, [])

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: unknown
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }

      const data = msg as Record<string, unknown>

      // Handle JSON-RPC responses (have id)
      if ("id" in data && typeof data.id === "string") {
        const pending = pendingRequestsRef.current.get(data.id)
        if (pending) {
          pendingRequestsRef.current.delete(data.id)
          if ("error" in data) {
            const errorResponse = data as JsonRpcErrorResponse
            pending.reject(new Error(errorResponse.error.message))
          } else {
            const successResponse = data as JsonRpcSuccessResponse
            pending.resolve(successResponse.result)
          }
          return
        }
      }

      // Handle Responses-style events
      if ("type" in data && typeof data.type === "string") {
        const eventData = data as ResponseStreamEvent

        switch (eventData.type) {
          case "response.created": {
            setIsTyping(true)
            setTypingState("thinking")
            setActiveMessageId(eventData.response.id)
            break
          }

          case "response.queued": {
            setIsTyping(true)
            setTypingState("thinking")
            break
          }

          case "response.in_progress": {
            setIsTyping(true)
            setTypingState("streaming")
            break
          }

          case "response.output_text.delta": {
            setStreamingContent((prev) => prev + eventData.delta)
            break
          }

          case "response.output_text.done": {
            setStreamingContent(eventData.text)
            break
          }

          case "response.refusal.delta": {
            setStreamingContent((prev) => prev + eventData.delta)
            break
          }

          case "response.refusal.done": {
            setStreamingContent(eventData.refusal)
            break
          }

          case "response.output_item.added": {
            const item = eventData.item
            if (item.type === "function_call") {
              toolItemToCallIdRef.current.set(item.id, item.call_id)
              if (typeof item.arguments === "string") {
                toolArgsRef.current.set(item.id, item.arguments)
              }

              setTypingState("tool_executing")
              setActiveTools((prev) => [
                ...prev,
                {
                  id: item.call_id,
                  name: item.name,
                  arguments: safeJsonParse<Record<string, unknown>>(
                    item.arguments ?? "{}",
                    {}
                  ),
                  status: "running",
                  rawArguments: item.arguments ?? "",
                  startedAt: Date.now(),
                },
              ])
            } else if (item.type === "function_call_output") {
              const result = parseToolResult(item.call_id, item.output)
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.id === item.call_id
                    ? {
                        ...t,
                        status: result.error ? ("error" as const) : ("completed" as const),
                        result,
                        error: result.error,
                      }
                    : t
                )
              )
            }
            break
          }
          case "response.function_call_arguments.delta": {
            const callId = toolItemToCallIdRef.current.get(eventData.item_id)
            if (callId) {
              const existingArgs = toolArgsRef.current.get(eventData.item_id) ?? ""
              const nextArgs = existingArgs + eventData.delta
              toolArgsRef.current.set(eventData.item_id, nextArgs)
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.id === callId
                    ? {
                        ...t,
                        rawArguments: nextArgs,
                        arguments: safeJsonParse<Record<string, unknown>>(
                          nextArgs,
                          t.arguments
                        ),
                      }
                    : t
                )
              )
            }
            break
          }
          case "response.function_call_arguments.done": {
            const callId = toolItemToCallIdRef.current.get(eventData.item_id)
            if (callId) {
              toolArgsRef.current.set(eventData.item_id, eventData.arguments)
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.id === callId
                    ? {
                        ...t,
                        rawArguments: eventData.arguments,
                        arguments: safeJsonParse<Record<string, unknown>>(
                          eventData.arguments,
                          t.arguments
                        ),
                      }
                    : t
                )
              )
            }
            break
          }

          case "response.completed": {
            const response = eventData.response
            // Use ref to get current streaming content without dependency
            let messageContent = streamingContentRef.current
            for (const item of response.output) {
              if (item.type === "message") {
                for (const part of item.content) {
                  if (part.type === "output_text") {
                    messageContent = part.text
                  }
                  if (part.type === "refusal") {
                    messageContent = part.refusal
                  }
                }
              }
            }

            setMessages((prev) => [
              ...prev,
              {
                id: response.id,
                role: "assistant" as const,
                content: messageContent,
                timestamp: Date.now(),
              },
            ])

            setIsTyping(false)
            setTypingState(null)
            setStreamingContent("")
            setActiveTools([])
            setActiveMessageId(null)
            toolArgsRef.current.clear()
            toolItemToCallIdRef.current.clear()
            break
          }

          case "response.failed": {
            const errorMessage = eventData.response.error?.message ?? "Response failed"
            onErrorRef.current?.(new Error(errorMessage))
            setIsTyping(false)
            setTypingState(null)
            setStreamingContent("")
            setActiveTools([])
            setActiveMessageId(null)
            toolArgsRef.current.clear()
            toolItemToCallIdRef.current.clear()
            break
          }

          case "error": {
            onErrorRef.current?.(new Error(eventData.error.message))
            setIsTyping(false)
            setTypingState(null)
            setStreamingContent("")
            setActiveTools([])
            setActiveMessageId(null)
            toolArgsRef.current.clear()
            toolItemToCallIdRef.current.clear()
            break
          }
        }

        return
      }

      // Handle notifications (no id)
      if ("method" in data && typeof data.method === "string") {
        const params = (data as { params?: Record<string, unknown> }).params ?? {}

        if (data.method === "session.resumed") {
          const messageCount = params.messageCount as number
          reconnectAttemptsRef.current = 0
          onSessionResumedRef.current?.(messageCount)
        }

        if (data.method === "chat.compacting") {
          const phase = params.phase as string
          setIsCompacting(phase === "start")
        }

        if (data.method === "character.pose_change") {
          const pose = params.pose
          if (typeof pose === "string" && isAgentPose(pose)) {
            setPendingPoseChange(pose)
          }
        }

        if (data.method === "canvas.state_snapshot") {
          const version = params.version
          const blueprint = params.blueprint
          if (typeof version === "number" && isCanvasBlueprint(blueprint)) {
            setCanvasVersion(version)
            setCanvasBlueprint(blueprint)
            setLastCanvasOp(null)
          }
        }

        if (data.method === "canvas.state_patch") {
          const version = params.version
          const blueprint = params.blueprint
          const op = params.op
          if (typeof version === "number" && isCanvasBlueprint(blueprint)) {
            setCanvasVersion(version)
            setCanvasBlueprint(blueprint)
            setLastCanvasOp(isCanvasOp(op) ? op : null)
          }
        }

        if (data.method === "soul.state_snapshot") {
          const state = params.state as SoulState | undefined
          if (state && typeof state.stage === "string") {
            setSoulState(state)
            setSoulStage(state.stage)
          }
        }

        if (data.method === "soul.stage_change") {
          const stage = params.stage as SoulStage | undefined
          if (typeof stage === "string") {
            setSoulStage(stage)
            // Update full soul state if we have one, otherwise create partial
            setSoulState((prev) =>
              prev
                ? { ...prev, stage, interactionCount: (params.interactionCount as number) ?? prev.interactionCount }
                : null
            )
          }
        }
      }
    },
    [] // callbacks accessed via stable refs
  )

// Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if unmounting
    if (isUnmountingRef.current) {
      return
    }

    // Increment connection ID to invalidate any previous connection's callbacks
    const thisConnectionId = ++connectionIdRef.current

    // Close any existing connection (handles React StrictMode double-mount)
    if (wsRef.current) {
      // Don't let old connection's onclose trigger reconnect
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.onopen = null
      // Only close OPEN sockets to avoid "closed before established" warnings
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
    }

    const baseUrl = url ?? getDefaultWebSocketUrl()
    const sessionId = getSessionId()
    const wsUrl = `${baseUrl}?sessionId=${sessionId}`

    setConnectionState("connecting")

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      // Ignore if this isn't the current connection
      if (connectionIdRef.current !== thisConnectionId) return

      setConnectionState("connected")
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      onConnectRef.current?.()
    }

    ws.onmessage = (event) => {
      // Ignore if this isn't the current connection
      if (connectionIdRef.current !== thisConnectionId) return
      handleMessage(event)
    }

    ws.onclose = (_event) => {
      // Ignore if this isn't the current connection or if unmounting
      if (connectionIdRef.current !== thisConnectionId || isUnmountingRef.current) {
        return
      }

      setConnectionState("disconnected")
      onDisconnectRef.current?.()

      // Auto-reconnect with exponential backoff (within 30s grace period)
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        setConnectionState("reconnecting")
        const delay = calculateReconnectDelay(reconnectAttemptsRef.current)
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++
          connect()
        }, delay)
      }
    }

    ws.onerror = () => {
      // Ignore if this isn't the current connection or if unmounting
      if (connectionIdRef.current !== thisConnectionId || isUnmountingRef.current) {
        return
      }
      onErrorRef.current?.(new Error("WebSocket connection error"))
    }

    wsRef.current = ws
  }, [url, getSessionId, handleMessage])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    // Cancel any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    // Prevent auto-reconnect
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS + 1

    // Close socket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setConnectionState("disconnected")
  }, [])

  // Send a chat message
  const sendMessage = useCallback(
    (text: string, characterState?: CharacterState): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not connected"))
          return
        }

        const requestId = `req_${Date.now()}`

        // Add user message optimistically and show thinking immediately
        const userMessageId = `user_${Date.now()}`
        setMessages((prev) => [
          ...prev,
          {
            id: userMessageId,
            role: "user" as const,
            content: text,
            timestamp: Date.now(),
          },
        ])
        setIsTyping(true)
        setTypingState("thinking")

        // Store pending request handler
        pendingRequestsRef.current.set(requestId, {
          resolve: (result) => {
            const r = result as { messageId: string }
            resolve(r.messageId)
          },
          reject,
        })

        // Send JSON-RPC request
        const request = {
          jsonrpc: "2.0" as const,
          id: requestId,
          method: "chat.send" as const,
          params: {
            message: text,
            ...(agentId && { agentId }),
            ...(characterState && { characterState }),
          },
        }

        wsRef.current.send(JSON.stringify(request))
      })
    },
    [agentId]
  )

  // Cancel current message generation
  const cancelMessage = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    const requestId = `req_cancel_${Date.now()}`

    wsRef.current.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "chat.cancel",
      })
    )

    // Reset typing state
    setIsTyping(false)
    setTypingState(null)
    setStreamingContent("")
    setActiveTools([])
    setActiveMessageId(null)
  }, [])

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([])
    setStreamingContent("")
    setActiveTools([])
    setActiveMessageId(null)
    setCanvasBlueprint(null)
    setCanvasVersion(null)
    setLastCanvasOp(null)
    setSoulState(null)
    setSoulStage(null)
    toolArgsRef.current.clear()
    toolItemToCallIdRef.current.clear()
  }, [])

  // Auto-connect on mount if enabled
  useEffect(() => {
    // Reset unmounting flag on mount
    isUnmountingRef.current = false

    if (autoConnect) {
      connect()
    }

    // Cleanup on unmount
    return () => {
      // Mark as unmounting to prevent auto-reconnect and stale callbacks
      isUnmountingRef.current = true
      // Invalidate any current connection's callbacks
      connectionIdRef.current++

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      // Clean up WebSocket (disable handlers first to prevent callbacks during close)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.onmessage = null
        wsRef.current.onopen = null
        // Only close OPEN sockets; CONNECTING ones are abandoned with nulled
        // handlers to avoid "WebSocket closed before connection established" warnings
        // (common in React StrictMode double-mount)
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close()
        }
        wsRef.current = null
      }
      // Note: Keep sessionIdRef for React StrictMode re-mount
    }
  }, [autoConnect, connect])

  const clearPoseChange = useCallback(() => setPendingPoseChange(null), [])

  // Return a stable object reference when values haven't changed
  return useMemo(
    (): UseWebSocketChatReturn => ({
      connectionState,
      connect,
      disconnect,
      messages,
      sendMessage,
      cancelMessage,
      isTyping,
      typingState,
      streamingContent,
      activeTools,
      clearMessages,
      activeMessageId,
      isCompacting,
      pendingPoseChange,
      clearPoseChange,
      canvasBlueprint,
      canvasVersion,
      lastCanvasOp,
      soulState,
      soulStage,
    }),
    [
      connectionState,
      connect,
      disconnect,
      messages,
      sendMessage,
      cancelMessage,
      isTyping,
      typingState,
      streamingContent,
      activeTools,
      clearMessages,
      activeMessageId,
      isCompacting,
      pendingPoseChange,
      clearPoseChange,
      canvasBlueprint,
      canvasVersion,
      lastCanvasOp,
      soulState,
      soulStage,
    ]
  )
}
