import { createContext, useContext } from "react"
import type { ChatMessage, SoulState, SoulStage } from "@bibboy/shared"
import type { ConnectionState } from "@/hooks/websocket-chat-utils"

// ============================================================================
// Types
// ============================================================================

export type SidebarMode =
  | { readonly type: "none" }
  | { readonly type: "chat-timeline" }
  | { readonly type: "agent-config" }

/** Chat data exposed via context so ChatTimeline can read without parent re-renders */
export interface ChatDataContextValue {
  readonly messages: ChatMessage[]
  readonly isTyping: boolean
  readonly streamingContent: string
}

/** Agent config data exposed via context for the AgentConfigPanel */
export interface AgentConfigContextValue {
  readonly soulState: SoulState | null
  readonly soulStage: SoulStage
  readonly connectionState: ConnectionState
}

// ============================================================================
// Sidebar mode constants (stable references to avoid re-renders)
// ============================================================================

export const SIDEBAR_NONE: SidebarMode = { type: "none" }
export const SIDEBAR_CHAT_TIMELINE: SidebarMode = { type: "chat-timeline" }
export const SIDEBAR_AGENT_CONFIG: SidebarMode = { type: "agent-config" }

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

// ============================================================================
// Context for agent config
// ============================================================================

const defaultAgentConfig: AgentConfigContextValue = {
  soulState: null,
  soulStage: "orb",
  connectionState: "disconnected",
}

export const AgentConfigContext = createContext<AgentConfigContextValue>(defaultAgentConfig)

export function useAgentConfig(): AgentConfigContextValue {
  return useContext(AgentConfigContext)
}
