import { useEffect, lazy, Suspense } from "react"
import { useLayoutNav } from "@/components/MainLayout"
import { useWebSocketChat } from "@/hooks/useWebSocketChat"

// Lazy-load PhaserChat so the full Phaser engine (~1.2 MB) is only
// downloaded when the user lands on the index tab.
const PhaserChat = lazy(() =>
  import("@bibboy/phaser-chat").then((m) => ({ default: m.PhaserChat }))
)
import { SIDEBAR_CHAT_TIMELINE } from "@/components/RightSidebar"

// ============================================================================
// Main Component
// ============================================================================

export function HomePage() {
  const { setSidebarMode, setChatData } = useLayoutNav()
  const wsChat = useWebSocketChat({ autoConnect: true })

  const { connectionState } = wsChat

  // Set sidebar mode to chat timeline
  useEffect(() => {
    setSidebarMode(SIDEBAR_CHAT_TIMELINE)
    return () => setSidebarMode({ type: "none" })
  }, [setSidebarMode])

  // Push chat data to sidebar context (no parent re-render for sidebar component)
  useEffect(() => {
    setChatData({
      messages: wsChat.messages,
      isTyping: wsChat.isTyping,
      streamingContent: wsChat.streamingContent,
    })
  }, [wsChat.messages, wsChat.isTyping, wsChat.streamingContent, setChatData])

  return (
    <Suspense fallback={<div className="w-full h-[300px]" />}>
      <PhaserChat
        chatAdapter={wsChat}
        connectionState={connectionState}
        canvasBlueprint={wsChat.canvasBlueprint}
        canvasVersion={wsChat.canvasVersion}
        lastCanvasOp={wsChat.lastCanvasOp}
        soulState={wsChat.soulState}
        soulStage={wsChat.soulStage}
      />
    </Suspense>
  )
}
