import type {
  SoulStage,
  SoulState,
  PersonalityTrait,
  SoulEvolutionEvent,
  CanvasCharacterBlueprint,
  CanvasOp,
} from "@bibboy/shared"
import {
  SOUL_STAGE_THRESHOLDS,
  createDefaultSoulState,
  getNextStage,
  getDominantTraits,
  createDefaultCanvasBlueprint,
} from "@bibboy/shared"
import type { CanvasToolRuntime } from "../tools/canvas-tools"

// ============================================================================
// Soul State Service (session-scoped, plain class)
// ============================================================================

/**
 * Callback when a soul stage change occurs.
 */
export interface SoulStageChangeCallback {
  (payload: {
    sessionId: string
    stage: SoulStage
    previousStage: SoulStage
    trigger: string
    interactionCount: number
  }): void
}

/**
 * Runtime interface for soul tools (similar to CanvasToolRuntime).
 */
export interface SoulToolRuntime {
  readonly sessionId: string
  readonly getState: () => SoulState
  readonly observeTrait: (
    trait: PersonalityTrait,
    strength: number
  ) => { evolved: boolean; state: SoulState }
  readonly getBlueprint: () => CanvasCharacterBlueprint
}

/**
 * Manages soul state for a single session.
 */
export class SoulSession {
  private state: SoulState
  private canvasRuntime: CanvasToolRuntime | undefined
  private onStageChange: SoulStageChangeCallback | undefined
  readonly sessionId: string

  constructor(
    sessionId: string,
    canvasRuntime?: CanvasToolRuntime,
    onStageChange?: SoulStageChangeCallback
  ) {
    this.sessionId = sessionId
    this.canvasRuntime = canvasRuntime
    this.onStageChange = onStageChange
    this.state = createDefaultSoulState()

    // Apply initial orb blueprint
    this.applyStageBlueprint("orb", [])
  }

  getState(): SoulState {
    return { ...this.state }
  }

  /**
   * Record a personality observation from the agent.
   * Returns whether evolution occurred.
   */
  observeTrait(
    trait: PersonalityTrait,
    strength: number
  ): { evolved: boolean; state: SoulState } {
    // Clamp strength to 0-1
    const clampedStrength = Math.max(0, Math.min(1, strength))

    // Exponential moving average for trait scores
    const currentScore = this.state.traits[trait] ?? 0
    const alpha = 0.3 // learning rate
    const newScore = currentScore + alpha * (clampedStrength - currentScore)

    this.state = {
      ...this.state,
      traits: {
        ...this.state.traits,
        [trait]: Math.round(newScore * 1000) / 1000, // 3 decimal places
      },
      interactionCount: this.state.interactionCount + 1,
    }

    // Check for evolution
    const evolved = this.checkAndEvolve(trait)

    return { evolved, state: this.getState() }
  }

  /**
   * Get the current blueprint from canvas state.
   */
  getBlueprint(): CanvasCharacterBlueprint {
    return createDefaultCanvasBlueprint()
  }

  /**
   * Create a SoulToolRuntime for use by soul tools.
   */
  createRuntime(): SoulToolRuntime {
    return {
      sessionId: this.sessionId,
      getState: () => this.getState(),
      observeTrait: (trait, strength) => this.observeTrait(trait, strength),
      getBlueprint: () => this.getBlueprint(),
    }
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private checkAndEvolve(triggerTrait: PersonalityTrait): boolean {
    const nextStage = getNextStage(this.state.stage)
    if (!nextStage) return false

    const threshold = SOUL_STAGE_THRESHOLDS[nextStage]
    if (this.state.interactionCount < threshold) return false

    // Check trait development is sufficient
    const dominantTraits = getDominantTraits(this.state.traits)
    const hasTraitDevelopment = dominantTraits.length > 0

    // For later stages, require more trait development
    if (nextStage === "forming" && dominantTraits.length < 1) return false
    if (nextStage === "awakened" && dominantTraits.length < 2) return false
    if (nextStage === "evolved" && dominantTraits.length < 3) return false

    if (!hasTraitDevelopment && nextStage !== "nascent") return false

    // Evolve!
    const previousStage = this.state.stage
    const event: SoulEvolutionEvent = {
      fromStage: previousStage,
      toStage: nextStage,
      trigger: `trait:${triggerTrait}`,
      timestamp: Date.now(),
    }

    this.state = {
      ...this.state,
      stage: nextStage,
      history: [...this.state.history, event],
    }

    // Apply visual changes
    this.applyStageBlueprint(nextStage, dominantTraits)

    // Notify
    this.onStageChange?.({
      sessionId: this.sessionId,
      stage: nextStage,
      previousStage,
      trigger: `trait:${triggerTrait}`,
      interactionCount: this.state.interactionCount,
    })

    return true
  }

  /**
   * Apply visual blueprint changes based on soul stage and dominant traits.
   * Uses the canvas runtime to make changes visible to the client.
   */
  private applyStageBlueprint(
    stage: SoulStage,
    dominantTraits: PersonalityTrait[]
  ): void {
    if (!this.canvasRuntime) return

    const ops = this.computeStageOps(stage, dominantTraits)
    for (const op of ops) {
      // Fire and forget - apply operations to canvas
      this.canvasRuntime.applyOperation(op).then((result) => {
        if (result.changed) {
          this.canvasRuntime!.emitPatch({
            sessionId: this.sessionId,
            version: result.version,
            op,
            blueprint: result.blueprint,
          })
        }
      })
    }
  }

  /**
   * Compute canvas operations for a given soul stage.
   */
  private computeStageOps(
    stage: SoulStage,
    dominantTraits: PersonalityTrait[]
  ): CanvasOp[] {
    const ops: CanvasOp[] = []
    const traitColors = this.traitToColors(dominantTraits)

    switch (stage) {
      case "orb":
        // Minimal monochrome character
        ops.push({ type: "set_palette", palette: "mono" })
        ops.push({ type: "set_layer_variant", layer: "eyes", variant: "closed" })
        ops.push({ type: "set_layer_variant", layer: "hair", variant: "short" })
        ops.push({ type: "set_layer_variant", layer: "body", variant: "slim" })
        ops.push({ type: "set_layer_variant", layer: "accessory", variant: "none" })
        ops.push({ type: "set_pose", pose: "idle" })
        ops.push({ type: "set_animation", animation: "idle" })
        break

      case "nascent":
        // Eyes open, first colors appear
        ops.push({ type: "set_layer_variant", layer: "eyes", variant: "neutral" })
        if (traitColors.primary) {
          ops.push({ type: "set_layer_color", layer: "outfit", color: traitColors.primary })
        }
        break

      case "forming":
        // Hair and outfit variants based on traits
        ops.push({ type: "set_layer_variant", layer: "body", variant: "base" })
        ops.push({
          type: "set_layer_variant",
          layer: "hair",
          variant: this.traitToHairVariant(dominantTraits),
        })
        ops.push({
          type: "set_layer_variant",
          layer: "outfit",
          variant: this.traitToOutfitVariant(dominantTraits),
        })
        if (traitColors.primary) {
          ops.push({ type: "set_layer_color", layer: "outfit", color: traitColors.primary })
        }
        if (traitColors.secondary) {
          ops.push({ type: "set_layer_color", layer: "hair", color: traitColors.secondary })
        }
        break

      case "awakened":
        // Accessories appear, eyes become expressive
        ops.push({
          type: "set_layer_variant",
          layer: "eyes",
          variant: this.traitToEyeVariant(dominantTraits),
        })
        ops.push({
          type: "set_layer_variant",
          layer: "accessory",
          variant: this.traitToAccessoryVariant(dominantTraits),
        })
        if (traitColors.accent) {
          ops.push({ type: "set_layer_color", layer: "accessory", color: traitColors.accent })
        }
        if (traitColors.skin) {
          ops.push({ type: "set_layer_color", layer: "body", color: traitColors.skin })
        }
        ops.push({
          type: "set_animation",
          animation: this.traitToAnimation(dominantTraits),
        })
        break

      case "evolved":
        // Full personalization - agent can freely customize from here
        ops.push({ type: "set_layer_variant", layer: "eyes", variant: "happy" })
        ops.push({
          type: "set_pose",
          pose: this.traitToPose(dominantTraits),
        })
        ops.push({
          type: "set_animation",
          animation: this.traitToAnimation(dominantTraits),
        })
        break
    }

    return ops
  }

  // --------------------------------------------------------------------------
  // Trait → Visual Mappings
  // --------------------------------------------------------------------------

  private traitToColors(traits: PersonalityTrait[]): {
    primary?: string
    secondary?: string
    accent?: string
    skin?: string
  } {
    const primary = traits[0]
    const secondary = traits[1]

    const colorMap: Record<PersonalityTrait, string> = {
      curious: "#4A90D9",    // blue
      creative: "#9B59B6",   // purple
      analytical: "#2ECC71", // green
      playful: "#F39C12",    // orange
      calm: "#5DADE2",       // light blue
      energetic: "#E74C3C",  // red
      empathetic: "#E91E63", // pink
      bold: "#FF6B35",       // vivid orange
    }

    const skinMap: Record<PersonalityTrait, string> = {
      curious: "#F5D0A9",
      creative: "#F4C19B",
      analytical: "#E8C19E",
      playful: "#F5D0A9",
      calm: "#F2C9A1",
      energetic: "#F4C19B",
      empathetic: "#F5D0A9",
      bold: "#E8C19E",
    }

    return {
      primary: primary ? colorMap[primary] : undefined,
      secondary: secondary ? colorMap[secondary] : undefined,
      accent: primary ? colorMap[primary] : undefined,
      skin: primary ? skinMap[primary] : undefined,
    }
  }

  private traitToHairVariant(
    traits: PersonalityTrait[]
  ): "short" | "spiky" | "bob" | "messy" {
    const primary = traits[0]
    const map: Partial<Record<PersonalityTrait, "short" | "spiky" | "bob" | "messy">> = {
      curious: "messy",
      creative: "bob",
      analytical: "short",
      playful: "spiky",
      calm: "bob",
      energetic: "spiky",
      empathetic: "bob",
      bold: "messy",
    }
    return primary ? (map[primary] ?? "short") : "short"
  }

  private traitToOutfitVariant(
    traits: PersonalityTrait[]
  ): "hoodie" | "tshirt" | "jacket" {
    const primary = traits[0]
    const map: Partial<Record<PersonalityTrait, "hoodie" | "tshirt" | "jacket">> = {
      curious: "hoodie",
      creative: "jacket",
      analytical: "tshirt",
      playful: "tshirt",
      calm: "hoodie",
      energetic: "jacket",
      empathetic: "hoodie",
      bold: "jacket",
    }
    return primary ? (map[primary] ?? "hoodie") : "hoodie"
  }

  private traitToEyeVariant(
    traits: PersonalityTrait[]
  ): "neutral" | "happy" | "closed" {
    const primary = traits[0]
    if (!primary) return "neutral"
    if (["playful", "energetic", "empathetic"].includes(primary)) return "happy"
    return "neutral"
  }

  private traitToAccessoryVariant(
    traits: PersonalityTrait[]
  ): "none" | "glasses" | "cap" {
    const primary = traits[0]
    const map: Partial<Record<PersonalityTrait, "none" | "glasses" | "cap">> = {
      curious: "glasses",
      creative: "cap",
      analytical: "glasses",
      playful: "cap",
      calm: "none",
      energetic: "cap",
      empathetic: "none",
      bold: "glasses",
    }
    return primary ? (map[primary] ?? "none") : "none"
  }

  private traitToAnimation(
    traits: PersonalityTrait[]
  ): "idle" | "talk" | "walk" | "dance" | "celebrate" {
    const primary = traits[0]
    const map: Partial<Record<PersonalityTrait, "idle" | "talk" | "walk" | "dance" | "celebrate">> = {
      curious: "walk",
      creative: "dance",
      analytical: "idle",
      playful: "dance",
      calm: "idle",
      energetic: "celebrate",
      empathetic: "talk",
      bold: "celebrate",
    }
    return primary ? (map[primary] ?? "idle") : "idle"
  }

  private traitToPose(
    traits: PersonalityTrait[]
  ): "idle" | "wave" | "sit" | "celebrate" {
    const primary = traits[0]
    const map: Partial<Record<PersonalityTrait, "idle" | "wave" | "sit" | "celebrate">> = {
      curious: "wave",
      creative: "celebrate",
      analytical: "sit",
      playful: "celebrate",
      calm: "sit",
      energetic: "celebrate",
      empathetic: "wave",
      bold: "wave",
    }
    return primary ? (map[primary] ?? "idle") : "idle"
  }
}

// ============================================================================
// Session Store (global, keyed by session ID)
// ============================================================================

const sessions = new Map<string, SoulSession>()

export function getOrCreateSoulSession(
  sessionId: string,
  canvasRuntime?: CanvasToolRuntime,
  onStageChange?: SoulStageChangeCallback
): SoulSession {
  let session = sessions.get(sessionId)
  if (!session) {
    session = new SoulSession(sessionId, canvasRuntime, onStageChange)
    sessions.set(sessionId, session)
  }
  return session
}

export function getSoulSession(sessionId: string): SoulSession | undefined {
  return sessions.get(sessionId)
}

export function clearSoulSession(sessionId: string): void {
  sessions.delete(sessionId)
}

export function pruneSoulSessions(activeSessionIds: readonly string[]): number {
  const activeSet = new Set(activeSessionIds)
  let removed = 0
  for (const sessionId of sessions.keys()) {
    if (!activeSet.has(sessionId)) {
      sessions.delete(sessionId)
      removed++
    }
  }
  return removed
}
