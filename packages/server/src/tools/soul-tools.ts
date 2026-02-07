import { PERSONALITY_TRAITS, isPersonalityTrait, getDominantTraits } from "@bibboy/shared"
import type { PersonalityTrait } from "@bibboy/shared"
import type { AgentTool } from "./types"
import { errorResult, jsonResult, readStringParam, readNumberParam } from "./types"
import type { SoulToolRuntime } from "../services/SoulStateService"

// ============================================================================
// Soul Tools
// ============================================================================

function observeTraitTool(runtime: SoulToolRuntime): AgentTool {
  return {
    label: "Soul Observe Trait",
    name: "soul_observe_trait",
    description:
      "Record a personality observation about the user. Call this when you notice personality traits through conversation — curiosity, creativity, analytical thinking, playfulness, calmness, energy, empathy, or boldness. Don't call every message, only when a trait is clearly expressed.",
    parameters: {
      type: "object",
      properties: {
        trait: {
          type: "string",
          description: "The personality trait observed.",
          enum: [...PERSONALITY_TRAITS],
        },
        strength: {
          type: "number",
          description:
            "How strongly the trait was expressed (0.0 = barely, 1.0 = very strongly). Default: 0.5",
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["trait"],
    },
    execute: async (_toolCallId, args) => {
      const traitValue = readStringParam(args, "trait", { required: true })
      const strength = readNumberParam(args, "strength", { min: 0, max: 1 }) ?? 0.5

      if (!isPersonalityTrait(traitValue)) {
        return errorResult(
          `Invalid trait "${traitValue}". Valid: ${PERSONALITY_TRAITS.join(", ")}`
        )
      }

      const { evolved, state } = runtime.observeTrait(traitValue as PersonalityTrait, strength)
      const dominant = getDominantTraits(state.traits)

      return jsonResult({
        observed: { trait: traitValue, strength },
        stage: state.stage,
        evolved,
        interactionCount: state.interactionCount,
        dominantTraits: dominant,
        ...(evolved
          ? { message: `Character evolved to ${state.stage}!` }
          : {}),
      })
    },
  }
}

function getStateTool(runtime: SoulToolRuntime): AgentTool {
  return {
    label: "Soul Get State",
    name: "soul_get_state",
    description:
      "Get the current soul evolution state — stage, dominant personality traits, and interaction count.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const state = runtime.getState()
      const dominant = getDominantTraits(state.traits)

      return jsonResult({
        stage: state.stage,
        interactionCount: state.interactionCount,
        dominantTraits: dominant,
        allTraits: state.traits,
        evolutionHistory: state.history,
      })
    },
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSoulTools(runtime: SoulToolRuntime): AgentTool[] {
  return [observeTraitTool(runtime), getStateTool(runtime)]
}
