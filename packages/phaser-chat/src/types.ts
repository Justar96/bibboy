import type { ChatMessage, CharacterState, AgentPose } from "@bibboy/shared"

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"

export interface ChatAdapter {
  readonly messages: ChatMessage[]
  readonly isTyping: boolean
  readonly sendMessage: (text: string, characterState?: CharacterState) => Promise<string>
  readonly connect: () => void
  readonly isCompacting: boolean
  readonly pendingPoseChange: AgentPose | null
  readonly clearPoseChange: () => void
}
