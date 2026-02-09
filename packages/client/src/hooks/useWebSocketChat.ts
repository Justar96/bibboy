import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import {
  type AgentPose,
  type CharacterState,
  type ChatMessage,
  type TypingState,
} from "@bibboy/shared"
import {
  getDefaultWebSocketUrl,
  generateSessionId,
  isJsonRecord,
  tryJsonParse,
  calculateReconnectDelay,
  MAX_RECONNECT_ATTEMPTS,
  type ConnectionState,
  type ToolExecution,
} from "./websocket-chat-utils"
import { useToolStream, type ToolMessage } from "./useToolStream"
import {
  isJsonRpcErrorResponse,
  isJsonRpcSuccessResponse,
  readResultMessageId,
  readString,
} from "./websocket-chat-parsers"
import {
  createNotificationHandlers,
  createResponseEventHandlers,
} from "./websocket-chat-event-handlers"

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
  /** Throttled tool messages (80ms batched) for UI rendering */
  readonly toolMessages: ToolMessage[]
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
  const handleMessageRef = useRef<(event: MessageEvent) => void>(() => {})
  
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

  const clearToolTracking = useCallback(() => {
    toolArgsRef.current.clear()
    toolItemToCallIdRef.current.clear()
  }, [])

  // Throttled tool stream for smooth UI updates
  const {
    messages: toolMessages,
    upsertTool,
    completeTool: completeToolStream,
    reset: resetToolStream,
  } = useToolStream({ runId: activeMessageId })

  const resetStreamingState = useCallback(() => {
    setStreamingContent("")
    setActiveTools([])
    setActiveMessageId(null)
    clearToolTracking()
    resetToolStream()
  }, [clearToolTracking, resetToolStream])

  const stopTypingAndResetStreamingState = useCallback(() => {
    setIsTyping(false)
    setTypingState(null)
    resetStreamingState()
  }, [resetStreamingState])

  const startThinking = useCallback(() => {
    setIsTyping(true)
    setTypingState("thinking")
  }, [])

  const responseEventHandlers = useMemo(
    () =>
      createResponseEventHandlers({
        startThinking,
        stopTypingAndResetStreamingState,
        onErrorRef,
        toolItemToCallIdRef,
        toolArgsRef,
        streamingContentRef,
        setIsTyping,
        setTypingState,
        setStreamingContent,
        setActiveTools,
        setActiveMessageId,
        setMessages,
        // Throttled tool stream callbacks
        onToolStart: (toolCallId, name, args, rawArguments) => {
          upsertTool(toolCallId, { name, args, rawArguments, status: "running" })
        },
        onToolArgsUpdate: (toolCallId, args, rawArguments) => {
          upsertTool(toolCallId, { args, rawArguments })
        },
        onToolComplete: (toolCallId, output, isError) => {
          completeToolStream(toolCallId, output, isError)
        },
      }),
    [startThinking, stopTypingAndResetStreamingState, upsertTool, completeToolStream]
  )

  const notificationHandlers = useMemo(
    () =>
      createNotificationHandlers({
        reconnectAttemptsRef,
        onSessionResumedRef,
        setIsCompacting,
        setPendingPoseChange,
      }),
    []
  )

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (typeof event.data !== "string") {
        return
      }

      let msg: unknown
      msg = tryJsonParse(event.data)
      if (msg === undefined) {
        return
      }

      if (!isJsonRecord(msg)) {
        return
      }
      const data = msg

      // Handle JSON-RPC responses (have id)
      const responseId = readString(data.id)
      if (responseId) {
        const pending = pendingRequestsRef.current.get(responseId)
        if (pending) {
          pendingRequestsRef.current.delete(responseId)
          if (isJsonRpcErrorResponse(data)) {
            pending.reject(new Error(data.error.message))
            return
          }
          if (isJsonRpcSuccessResponse(data)) {
            pending.resolve(data.result)
            return
          }
          pending.reject(new Error("Invalid JSON-RPC response payload"))
          return
        }
      }

      // Handle Responses-style events
      const eventType = readString(data.type)
      if (eventType) {
        const handler = responseEventHandlers[eventType]
        if (handler) {
          handler(data)
        }

        return
      }

      // Handle notifications (no id)
      const method = readString(data.method)
      if (method) {
        const params = isJsonRecord(data.params) ? data.params : {}
        const handler = notificationHandlers[method]
        if (handler) {
          handler(params)
        }
      }
    },
    [notificationHandlers, responseEventHandlers]
  )

  // Keep handleMessage ref in sync so connect() always uses the latest handler
  useEffect(() => {
    handleMessageRef.current = handleMessage
  }, [handleMessage])

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
      handleMessageRef.current(event)
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
  }, [url, getSessionId])

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
        startThinking()

        // Store pending request handler
        pendingRequestsRef.current.set(requestId, {
          resolve: (result) => {
            const messageId = readResultMessageId(result)
            if (messageId !== null) {
              resolve(messageId)
              return
            }
            reject(new Error("Invalid chat.send response: missing messageId"))
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
    [agentId, startThinking]
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

    // Reset typing/stream state
    stopTypingAndResetStreamingState()
  }, [stopTypingAndResetStreamingState])

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([])
    resetStreamingState()
  }, [resetStreamingState])

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
      toolMessages,
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
      toolMessages,
    ]
  )
}
