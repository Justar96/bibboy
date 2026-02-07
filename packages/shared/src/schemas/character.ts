import { Schema } from "effect"

// ============================================================================
// Character States
// ============================================================================

/**
 * Full state space supported by the PixelBoy avatar runtime.
 */
export const CHARACTER_STATES = [
  "idle",
  "walking",
  "thinking",
  "talking",
  "sitting",
  "sleeping",
  "celebrating",
  "yawning",
  "phoneChecking",
  "reading",
  "working",
  "compacting",
  "stretching",
  "drinkingCoffee",
  "exercising",
  "dancing",
  "meditating",
] as const

export type CharacterState = (typeof CHARACTER_STATES)[number]

export const CharacterStateSchema = Schema.Literal(...CHARACTER_STATES)

/**
 * Pose values that can be requested by the set_character_pose tool.
 * This is intentionally a subset of CharacterState.
 */
export const AGENT_POSES = [
  "idle",
  "sitting",
  "stretching",
  "drinkingCoffee",
  "exercising",
  "dancing",
  "meditating",
  "celebrating",
  "sleeping",
] as const

export type AgentPose = (typeof AGENT_POSES)[number]

export const AgentPoseSchema = Schema.Literal(...AGENT_POSES)

const characterStateSet = new Set<string>(CHARACTER_STATES)
const agentPoseSet = new Set<string>(AGENT_POSES)

export const isCharacterState = (value: string): value is CharacterState =>
  characterStateSet.has(value)

export const isAgentPose = (value: string): value is AgentPose =>
  agentPoseSet.has(value)
