import { createContext, useContext } from "react"
import type { ChatMessage } from "@bibboy/shared"

// ============================================================================
// Types
// ============================================================================

export type SidebarMode =
  | { readonly type: "none" }
  | { readonly type: "chat-timeline" }

/** Chat data exposed via context so ChatTimeline can read without parent re-renders */
export interface ChatDataContextValue {
  readonly messages: ChatMessage[]
  readonly isTyping: boolean
  readonly streamingContent: string
}

// ============================================================================
// Sidebar mode constants (stable references to avoid re-renders)
// ============================================================================

export const SIDEBAR_NONE: SidebarMode = { type: "none" }
export const SIDEBAR_CHAT_TIMELINE: SidebarMode = { type: "chat-timeline" }

// ============================================================================
// Context for chat data
// ============================================================================

const defaultChatData: ChatDataContextValue = {
  messages: [],
  isTyping: false,
  streamingContent: "",
}

export const ChatDataContext = createContext<ChatDataContextValue>(defaultChatData)

export function useChatData(): ChatDataContextValue {
  return useContext(ChatDataContext)
}
