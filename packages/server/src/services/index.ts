// ============================================================================
// Services Exports
// ============================================================================

export {
  AgentService,
  AgentServiceLive,
  createAgentServiceLive,
  listAvailableAgents,
  type AgentServiceInterface,
} from "./AgentService"

export {
  ChatSessionManager,
  ChatSessionManagerLive,
  generateSessionId,
  GRACE_PERIOD_MS,
  CLEANUP_INTERVAL_MS,
  type SessionData,
  type ChatSessionManagerInterface,
} from "./ChatSessionManager"

export {
  ChatProcessor,
  ChatProcessorLive,
  type ChatProcessorInterface,
} from "./ChatProcessor"

export {
  CanvasStateService,
  CanvasStateServiceLive,
  type CanvasStateServiceInterface,
  type CanvasApplyResult,
  type CanvasSnapshot,
} from "./CanvasStateService"

export {
  SoulSession,
  getOrCreateSoulSession,
  getSoulSession,
  clearSoulSession,
  pruneSoulSessions,
  type SoulStageChangeCallback,
  type SoulToolRuntime,
} from "./SoulStateService"

export { extractAgentErrorMessage } from "./error-utils"
