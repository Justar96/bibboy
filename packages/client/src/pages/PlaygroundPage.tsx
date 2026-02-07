import { useState, useCallback, useRef, useEffect, memo, lazy, Suspense } from "react"
import type { ChatMessage as ChatMessageType } from "@bibboy/shared"
import { ChatThread, ChatInput, ToolOutputSidebar } from "@/components/Chat"
import type { SidebarContent, ChatQueueItem } from "@/components/Chat"
import { useChatMemory } from "@/hooks/useChatMemory"
import { useAgentChat } from "@/hooks/useAgentChat"
import { useWebSocketChat, type ToolExecution } from "@/hooks/useWebSocketChat"
import { usePromptSuggestions } from "@/hooks/usePromptSuggestions"
import { useLayoutNav } from "@/components/MainLayout"
import { PrefetchLink } from "@/components/PrefetchLink"

const PhaserBuilderCanvas = lazy(() =>
  import("@bibboy/phaser-chat").then((m) => ({ default: m.PhaserBuilderCanvas }))
)

// ============================================================================
// Config
// ============================================================================

/** WebSocket is default; HTTP fallback via ?http=true */
const USE_HTTP_FALLBACK =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("http") === "true"
    : false
const USE_WEBSOCKET_CHAT = !USE_HTTP_FALLBACK

/** Map of message ID → associated tool executions */
export type MessageToolsMap = Map<string, ToolExecution[]>

// ============================================================================
// Helpers
// ============================================================================

// wsToolToTool removed — WS and HTTP ToolExecution now share the same shape

// ============================================================================
// Nav Bar
// ============================================================================

interface PlaygroundNavProps {
  readonly hasMessages: boolean
  readonly onNewChat: () => void
  readonly connectionState: string
  readonly onReconnect: () => void
}

const PlaygroundNav = memo(function PlaygroundNav({
  hasMessages,
  onNewChat,
  connectionState,
  onReconnect,
}: PlaygroundNavProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <PrefetchLink
          to="/"
          className="font-mono text-[11px] text-[#999999] hover:text-[#0066CC] uppercase tracking-[0.1em] transition-colors"
        >
          Index
        </PrefetchLink>
        <span className="font-mono text-[11px] text-[#1A1A1A] font-semibold uppercase tracking-[0.1em]">
          Playground
        </span>
      </div>

      <div className="flex items-center gap-4">
        {connectionState !== "connected" && (
          <span className="font-mono text-[10px] text-amber-600 uppercase tracking-[0.1em]">
            {connectionState === "connecting" && "Connecting..."}
            {connectionState === "reconnecting" && "Reconnecting..."}
            {connectionState === "disconnected" && (
              <button onClick={onReconnect} className="hover:underline">
                Reconnect
              </button>
            )}
          </span>
        )}
        {hasMessages && (
          <button
            onClick={onNewChat}
            className="font-mono text-[11px] text-[#999999] hover:text-[#0066CC] uppercase tracking-[0.1em] transition-colors"
          >
            New Chat
          </button>
        )}
      </div>
    </div>
  )
})

// ============================================================================
// Tool Tracking Hooks
// ============================================================================

/**
 * Associates tool executions with their parent assistant message.
 * Returns the map and update helpers for both HTTP and WS transports.
 */
function useToolTracking() {
  const [messageToolsMap, setMessageToolsMap] = useState<MessageToolsMap>(
    new Map(),
  )
  const currentToolsRef = useRef<ToolExecution[]>([])

  const snapshotAndClear = useCallback((messageId: string) => {
    if (currentToolsRef.current.length === 0) return
    const tools = [...currentToolsRef.current]
    setMessageToolsMap((prev) => {
      const next = new Map(prev)
      next.set(messageId, tools)
      return next
    })
    currentToolsRef.current = []
  }, [])

  const trackToolStart = useCallback((tool: ToolExecution) => {
    currentToolsRef.current = [...currentToolsRef.current, tool]
  }, [])

  const trackToolEnd = useCallback((tool: ToolExecution) => {
    currentToolsRef.current = currentToolsRef.current.map((t) =>
      t.id === tool.id ? tool : t,
    )
  }, [])

  const reset = useCallback(() => {
    setMessageToolsMap(new Map())
    currentToolsRef.current = []
  }, [])

  return {
    messageToolsMap,
    setMessageToolsMap,
    snapshotAndClear,
    trackToolStart,
    trackToolEnd,
    resetTools: reset,
    currentToolsRef,
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function PlaygroundPage() {
  const { messages: httpMessages, addMessage, clearMessages: clearHttpMessages } =
    useChatMemory()
  const [error, setError] = useState<string | null>(null)
  const { setNavContent } = useLayoutNav()

  // Tool output sidebar state (OpenClaw pattern)
  const [sidebarContent, setSidebarContent] = useState<SidebarContent | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.6)

  // Message queue for messages sent while agent is busy
  const [chatQueue, setChatQueue] = useState<ChatQueueItem[]>([])

  const handleOpenSidebar = useCallback((title: string, content: string) => {
    setSidebarContent({ title, content })
  }, [])

  const handleCloseSidebar = useCallback(() => {
    setSidebarContent(null)
  }, [])

  const handleQueueRemove = useCallback((id: string) => {
    setChatQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const {
    messageToolsMap,
    setMessageToolsMap,
    snapshotAndClear,
    trackToolStart,
    trackToolEnd,
    resetTools,
    currentToolsRef,
  } = useToolTracking()

  // WS tool tracking refs
  const wsActiveToolsRef = useRef<ToolExecution[]>([])
  const prevWsMessageCountRef = useRef(0)

  // ------------------------------------------------------------------
  // WebSocket Chat
  // ------------------------------------------------------------------

  const wsChat = useWebSocketChat({
    autoConnect: USE_WEBSOCKET_CHAT,
    onError: (err) => setError(err.message),
    onSessionResumed: (count) => {
      console.log(`Session resumed with ${count} messages`)
    },
  })

  // Keep ref in sync so we can snapshot before hook clears them
  useEffect(() => {
    if (wsChat.activeTools.length > 0) {
      wsActiveToolsRef.current = wsChat.activeTools
    }
  }, [wsChat.activeTools])

  // Associate tools when new assistant message appears via WS
  useEffect(() => {
    if (!USE_WEBSOCKET_CHAT) return
    const msgs = wsChat.messages
    const prevCount = prevWsMessageCountRef.current
    prevWsMessageCountRef.current = msgs.length

    if (msgs.length > prevCount) {
      for (const msg of msgs.slice(prevCount)) {
        if (msg.role === "assistant" && wsActiveToolsRef.current.length > 0) {
          const tools = [...wsActiveToolsRef.current]
          setMessageToolsMap((prev) => {
            const next = new Map(prev)
            next.set(msg.id, tools)
            return next
          })
          wsActiveToolsRef.current = []
        }
      }
    }
  }, [wsChat.messages, setMessageToolsMap])

  // ------------------------------------------------------------------
  // HTTP Chat (fallback)
  // ------------------------------------------------------------------

  const httpChat = useAgentChat({
    onComplete: (message) => {
      snapshotAndClear(message.id)
      addMessage(message)
    },
    onError: (errorMsg) => {
      currentToolsRef.current = []
      setError(errorMsg)
    },
    onToolStart: trackToolStart,
    onToolEnd: trackToolEnd,
  })

  // ------------------------------------------------------------------
  // Unified Interface
  // ------------------------------------------------------------------

  const messages = USE_WEBSOCKET_CHAT ? wsChat.messages : httpMessages
  const isStreaming = USE_WEBSOCKET_CHAT ? wsChat.isTyping : httpChat.isStreaming
  const stream = USE_WEBSOCKET_CHAT
    ? wsChat.streamingContent
    : httpChat.stream
  const activeTools = USE_WEBSOCKET_CHAT
    ? wsChat.activeTools
    : httpChat.activeTools

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null)

      // Queue if agent is busy (OpenClaw pattern)
      if (isStreaming) {
        setChatQueue((prev) => [
          ...prev,
          {
            id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            text: content.trim(),
            createdAt: Date.now(),
          },
        ])
        return
      }

      if (USE_WEBSOCKET_CHAT) {
        try {
          await wsChat.sendMessage(content)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to send message",
          )
        }
      } else {
        const userMessage: ChatMessageType = {
          id: `user_${Date.now()}`,
          role: "user",
          content,
          timestamp: Date.now(),
        }
        addMessage(userMessage)
        await httpChat.sendMessage({
          message: content,
          history: [...httpMessages, userMessage],
        })
      }
    },
    [httpMessages, addMessage, httpChat, wsChat, isStreaming],
  )

  const handleNewChat = useCallback(() => {
    setError(null)
    resetTools()
    setSidebarContent(null)
    setChatQueue([])

    if (USE_WEBSOCKET_CHAT) {
      wsChat.clearMessages()
    } else {
      clearHttpMessages()
      httpChat.abort()
    }
  }, [clearHttpMessages, httpChat, wsChat, resetTools])

  const handleReconnect = useCallback(() => {
    wsChat.connect()
  }, [wsChat])

  const handleAbort = useCallback(() => {
    if (USE_WEBSOCKET_CHAT) {
      wsChat.cancelMessage()
    } else {
      httpChat.abort()
    }
  }, [wsChat, httpChat])

  // Flush queue when agent finishes (OpenClaw pattern)
  const prevStreamingRef = useRef(isStreaming)
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    if (wasStreaming && !isStreaming && chatQueue.length > 0) {
      const [next, ...rest] = chatQueue
      setChatQueue(rest)
      // Small delay to let the UI settle
      setTimeout(() => {
        sendMessage(next.text)
      }, 100)
    }
  }, [isStreaming, chatQueue, sendMessage])

  // ------------------------------------------------------------------
  // Nav
  // ------------------------------------------------------------------

  useEffect(() => {
    setNavContent(
      <PlaygroundNav
        hasMessages={messages.length > 0}
        onNewChat={handleNewChat}
        connectionState={
          USE_WEBSOCKET_CHAT ? wsChat.connectionState : "connected"
        }
        onReconnect={handleReconnect}
      />,
    )
    return () => setNavContent(null)
  }, [
    messages.length,
    handleNewChat,
    wsChat.connectionState,
    handleReconnect,
    setNavContent,
  ])

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const showEmptyState = messages.length === 0 && !isStreaming
  const { suggestions: promptSuggestions, isLoading: isSuggestionsLoading } =
    usePromptSuggestions()

  return (
    <section className="min-h-[calc(100vh-200px)] lg:min-h-[calc(100vh-180px)] flex flex-col">
      {USE_WEBSOCKET_CHAT && (
        <Suspense fallback={<div className="w-full h-[270px] mb-4 sm:mb-6" />}>
          <PhaserBuilderCanvas
            blueprint={wsChat.canvasBlueprint}
            version={wsChat.canvasVersion}
            lastOp={wsChat.lastCanvasOp}
            connectionState={wsChat.connectionState}
          />
        </Suspense>
      )}

      {/* Messages + Sidebar split container */}
      <div className={`flex-1 flex ${sidebarContent ? "gap-0" : ""}`}>
        {/* Main chat area */}
        <div
          className="flex-1 min-w-0"
          style={sidebarContent ? { flex: `0 0 ${splitRatio * 100}%` } : undefined}
        >
          <ChatThread
            messages={messages}
            isLoading={isStreaming}
            stream={stream || null}
            error={error}
            messageToolsMap={messageToolsMap}
            activeTools={activeTools}
            onOpenSidebar={handleOpenSidebar}
          />
        </div>

        {/* Tool output sidebar (OpenClaw pattern) */}
        <ToolOutputSidebar
          content={sidebarContent}
          onClose={handleCloseSidebar}
          splitRatio={splitRatio}
          onSplitRatioChange={setSplitRatio}
        />
      </div>

      {/* Input */}
      <div className={`mt-auto ${showEmptyState ? "pt-6" : "pt-8"}`}>
        <ChatInput
          onSend={sendMessage}
          disabled={
            USE_WEBSOCKET_CHAT && wsChat.connectionState !== "connected"
          }
          placeholder="Ask me anything..."
          isBusy={isStreaming}
          onAbort={handleAbort}
          connectionState={
            USE_WEBSOCKET_CHAT ? wsChat.connectionState : "connected"
          }
          onReconnect={handleReconnect}
          queue={chatQueue}
          onQueueRemove={handleQueueRemove}
        />

        {/* Prompt suggestions */}
        {showEmptyState &&
          !isSuggestionsLoading &&
          promptSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {promptSuggestions.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="px-3 py-1.5 font-mono text-[11px] text-[#999999] hover:text-[#0066CC] bg-[#FAFAFA] hover:bg-[#F0F4FF] border border-[#E8E8E8] hover:border-[#0066CC]/30 rounded transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
      </div>
    </section>
  )
}

export default PlaygroundPage
