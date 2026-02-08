// ============================================================================
// Chat Hooks
// ============================================================================

export { useAgentChat } from "./useAgentChat"
export type { AgentChatRequest, ToolExecution } from "./useAgentChat"

export { useWebSocketChat } from "./useWebSocketChat"
export type {
  ConnectionState,
  ToolExecution as WsToolExecution,
  UseWebSocketChatOptions,
  UseWebSocketChatReturn,
} from "./useWebSocketChat"

export { useToolStream } from "./useToolStream"
export type {
  ToolStreamEntry,
  ToolMessage,
  ToolMessageContent,
  UseToolStreamOptions,
  UseToolStreamReturn,
} from "./useToolStream"

export { useChatQueue, isChatStopCommand, isChatResetCommand } from "./useChatQueue"
export type {
  ChatQueueItem,
  ChatAttachment,
  UseChatQueueOptions,
  UseChatQueueReturn,
} from "./useChatQueue"

export { useChatMemory } from "./useChatMemory"
export type { UseChatMemoryResult } from "./useChatMemory"

export { usePromptSuggestions } from "./usePromptSuggestions"
export type { UsePromptSuggestionsResult } from "./usePromptSuggestions"

// ============================================================================
// Navigation Hooks
// ============================================================================

export { useViewTransition } from "./useViewTransition"
export type { UseViewTransitionResult } from "./useViewTransition"

// ============================================================================
// File Hooks
// ============================================================================

export { useWorkspaceFiles } from "./useWorkspaceFiles"
export type { UseWorkspaceFilesResult, WorkspaceFile } from "./useWorkspaceFiles"
