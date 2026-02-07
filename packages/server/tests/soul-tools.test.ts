import { describe, expect, it, vi } from "vitest"
import { PERSONALITY_TRAITS } from "@bibboy/shared"
import { createSoulTools } from "../src/tools/soul-tools"
import type { SoulToolRuntime } from "../src/services/SoulStateService"

function createTraitScores(): Record<(typeof PERSONALITY_TRAITS)[number], number> {
  return PERSONALITY_TRAITS.reduce(
    (acc, trait) => {
      acc[trait] = 0.1
      return acc
    },
    {} as Record<(typeof PERSONALITY_TRAITS)[number], number>
  )
}

describe("soul tools", () => {
  it("returns error for invalid trait", async () => {
    const runtime: SoulToolRuntime = {
      observeTrait: vi.fn(() => ({
        evolved: false,
        state: {
          stage: "orb",
          traits: createTraitScores(),
          interactionCount: 1,
          history: [],
        },
      })),
      getState: vi.fn(() => ({
        stage: "orb",
        traits: createTraitScores(),
        interactionCount: 1,
        history: [],
      })),
      setPoseChangeCallback: vi.fn(),
      clearPoseChangeCallback: vi.fn(),
    }

    const observeTool = createSoulTools(runtime).find((tool) => tool.name === "soul_observe_trait")
    if (!observeTool) {
      throw new Error("soul_observe_trait tool not found")
    }

    const result = await observeTool.execute("call_1", { trait: "not-a-trait", strength: 0.5 })
    expect(result.error).toContain("Invalid trait")
    expect(runtime.observeTrait).not.toHaveBeenCalled()
  })

  it("passes narrowed trait to runtime observeTrait", async () => {
    const observeTrait = vi.fn(() => ({
      evolved: false,
      state: {
        stage: "orb",
        traits: createTraitScores(),
        interactionCount: 2,
        history: [],
      },
    }))

    const runtime: SoulToolRuntime = {
      observeTrait,
      getState: vi.fn(() => ({
        stage: "orb",
        traits: createTraitScores(),
        interactionCount: 2,
        history: [],
      })),
      setPoseChangeCallback: vi.fn(),
      clearPoseChangeCallback: vi.fn(),
    }

    const observeTool = createSoulTools(runtime).find((tool) => tool.name === "soul_observe_trait")
    if (!observeTool) {
      throw new Error("soul_observe_trait tool not found")
    }

    const result = await observeTool.execute("call_2", { trait: "curious", strength: 0.8 })
    expect(result.error).toBeUndefined()
    expect(observeTrait).toHaveBeenCalledWith("curious", 0.8)
  })
})
