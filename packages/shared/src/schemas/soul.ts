import { Schema } from "effect"

// ============================================================================
// Soul Evolution Stages
// ============================================================================

export const SOUL_STAGES = ["orb", "nascent", "forming", "awakened", "evolved"] as const
export type SoulStage = (typeof SOUL_STAGES)[number]
export const SoulStageSchema = Schema.Literal(...SOUL_STAGES)

/**
 * Interaction thresholds for each stage transition.
 * The agent can also force-advance via soul_observe_trait when traits are strong enough.
 */
export const SOUL_STAGE_THRESHOLDS: Record<SoulStage, number> = {
  orb: 0,
  nascent: 3,
  forming: 8,
  awakened: 16,
  evolved: 30,
}

// ============================================================================
// Personality Traits
// ============================================================================

export const PERSONALITY_TRAITS = [
  "curious",
  "creative",
  "analytical",
  "playful",
  "calm",
  "energetic",
  "empathetic",
  "bold",
] as const
export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number]
export const PersonalityTraitSchema = Schema.Literal(...PERSONALITY_TRAITS)

const personalityTraitSet = new Set<string>(PERSONALITY_TRAITS)
export const isPersonalityTrait = (value: string): value is PersonalityTrait =>
  personalityTraitSet.has(value)

// ============================================================================
// Soul Evolution Event
// ============================================================================

export const SoulEvolutionEventSchema = Schema.Struct({
  fromStage: SoulStageSchema,
  toStage: SoulStageSchema,
  trigger: Schema.String,
  timestamp: Schema.Number,
})

export type SoulEvolutionEvent = Schema.Schema.Type<typeof SoulEvolutionEventSchema>

// ============================================================================
// Trait Scores (0–1 per trait)
// ============================================================================

export const TraitScoresSchema = Schema.Record({
  key: PersonalityTraitSchema,
  value: Schema.Number,
})

export type TraitScores = Schema.Schema.Type<typeof TraitScoresSchema>

// ============================================================================
// Soul State (session-scoped)
// ============================================================================

export const SoulStateSchema = Schema.Struct({
  stage: SoulStageSchema,
  traits: TraitScoresSchema,
  interactionCount: Schema.Number,
  history: Schema.Array(SoulEvolutionEventSchema),
})

export type SoulState = Schema.Schema.Type<typeof SoulStateSchema>

// ============================================================================
// Soul Notification Payloads (WebSocket)
// ============================================================================

export const SoulStageChangePayloadSchema = Schema.Struct({
  sessionId: Schema.String,
  stage: SoulStageSchema,
  previousStage: SoulStageSchema,
  trigger: Schema.String,
  interactionCount: Schema.Number,
})

export type SoulStageChangePayload = Schema.Schema.Type<typeof SoulStageChangePayloadSchema>

export const SoulStateSnapshotPayloadSchema = Schema.Struct({
  sessionId: Schema.String,
  state: SoulStateSchema,
})

export type SoulStateSnapshotPayload = Schema.Schema.Type<typeof SoulStateSnapshotPayloadSchema>

// ============================================================================
// Helpers
// ============================================================================

const stageOrder = SOUL_STAGES as readonly SoulStage[]

export function getNextStage(current: SoulStage): SoulStage | null {
  const idx = stageOrder.indexOf(current)
  return idx < stageOrder.length - 1 ? stageOrder[idx + 1] : null
}

export function createDefaultTraitScores(): Record<PersonalityTrait, number> {
  return Object.fromEntries(PERSONALITY_TRAITS.map((t) => [t, 0])) as Record<
    PersonalityTrait,
    number
  >
}

export function createDefaultSoulState(): SoulState {
  return {
    stage: "orb",
    traits: createDefaultTraitScores(),
    interactionCount: 0,
    history: [],
  }
}

/**
 * Get the dominant traits (top N by score, must be > 0).
 */
export function getDominantTraits(
  traits: Record<PersonalityTrait, number>,
  topN = 3
): PersonalityTrait[] {
  return (Object.entries(traits) as [PersonalityTrait, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([trait]) => trait)
}
