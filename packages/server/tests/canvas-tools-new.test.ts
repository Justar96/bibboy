import { describe, expect, it } from "vitest"
import type { CanvasCharacterBlueprint, CanvasOp } from "@bibboy/shared"
import {
  createDefaultCanvasBlueprint,
  createRandomCanvasBlueprint,
  DEFAULT_LAYER_VISIBILITY,
  CANVAS_PALETTE_PRESETS,
  HAIR_VARIANTS,
  isHexColor,
} from "@bibboy/shared"
import { createCanvasTools } from "../src/tools/canvas-tools"

function createRuntime() {
  let version = 1
  let blueprint: CanvasCharacterBlueprint = createDefaultCanvasBlueprint()
  const patches: Array<{
    sessionId: string
    version: number
    op: CanvasOp
    blueprint: CanvasCharacterBlueprint
  }> = []

  return {
    runtime: {
      sessionId: "test-session",
      getState: async () => ({ version, blueprint }),
      applyOperation: async (op: CanvasOp) => {
        switch (op.type) {
          case "set_layer_variant": {
            blueprint = {
              ...blueprint,
              layers: {
                ...blueprint.layers,
                [op.layer]: {
                  ...blueprint.layers[op.layer],
                  variant: op.variant,
                },
              },
            }
            break
          }
          case "set_layer_color": {
            blueprint = {
              ...blueprint,
              layers: {
                ...blueprint.layers,
                [op.layer]: {
                  ...blueprint.layers[op.layer],
                  color: op.color,
                },
              },
            }
            break
          }
          case "set_palette": {
            const palette = CANVAS_PALETTE_PRESETS[op.palette]
            blueprint = {
              ...blueprint,
              palettePreset: op.palette,
              layers: {
                body: { ...blueprint.layers.body, color: palette.skin },
                hair: { ...blueprint.layers.hair, color: palette.hair },
                eyes: { ...blueprint.layers.eyes, color: palette.eyes },
                outfit: { ...blueprint.layers.outfit, color: palette.outfit },
                accessory: { ...blueprint.layers.accessory, color: palette.accessory },
              },
            }
            break
          }
          case "set_pose": {
            blueprint = { ...blueprint, pose: op.pose }
            break
          }
          case "set_animation": {
            blueprint = { ...blueprint, animation: op.animation }
            break
          }
          case "set_layer_visibility": {
            blueprint = {
              ...blueprint,
              visibility: {
                ...DEFAULT_LAYER_VISIBILITY,
                ...blueprint.visibility,
                [op.layer]: op.visible,
              },
            }
            break
          }
          case "randomize_character": {
            blueprint = createRandomCanvasBlueprint()
            break
          }
          case "reset_character": {
            blueprint = createDefaultCanvasBlueprint()
            break
          }
          case "undo": {
            break
          }
        }
        version += 1
        return { version, blueprint, changed: true }
      },
      exportBlueprint: async () => blueprint,
      emitPatch: (payload: {
        sessionId: string
        version: number
        op: CanvasOp
        blueprint: CanvasCharacterBlueprint
      }) => {
        patches.push(payload)
      },
    },
    patches,
    getBlueprint: () => blueprint,
  }
}

function getTool(name: string, runtime: ReturnType<typeof createRuntime>["runtime"]) {
  const tool = createCanvasTools(runtime).find((t) => t.name === name)
  if (!tool) throw new Error(`Tool "${name}" not found`)
  return tool
}

function parseResult(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text)
}

// ============================================================================
// canvas_batch_ops
// ============================================================================

describe("canvas_batch_ops", () => {
  it("applies multiple operations atomically", async () => {
    const { runtime, patches } = createRuntime()
    const tool = getTool("canvas_batch_ops", runtime)

    const operations = JSON.stringify([
      { type: "set_layer_variant", layer: "hair", variant: "spiky" },
      { type: "set_pose", pose: "wave" },
      { type: "set_layer_color", layer: "outfit", color: "#FF5500" },
    ])

    const result = await tool.execute("call_1", { operations })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.applied).toBe(3)
    expect(patches).toHaveLength(3)

    const bp = payload.blueprint as CanvasCharacterBlueprint
    expect(bp.layers.hair.variant).toBe("spiky")
    expect(bp.pose).toBe("wave")
    expect(bp.layers.outfit.color).toBe("#FF5500")
  })

  it("rejects invalid JSON string", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_batch_ops", runtime)

    const result = await tool.execute("call_2", { operations: "not json" })
    expect(result.error).toContain("Invalid JSON")
  })

  it("rejects empty array", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_batch_ops", runtime)

    const result = await tool.execute("call_3", { operations: "[]" })
    expect(result.error).toContain("non-empty array")
  })

  it("rejects more than 20 operations", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_batch_ops", runtime)

    const ops = Array.from({ length: 21 }, () => ({
      type: "set_pose",
      pose: "wave",
    }))
    const result = await tool.execute("call_4", { operations: JSON.stringify(ops) })
    expect(result.error).toContain("Maximum 20")
  })

  it("handles mixed valid and invalid ops with partial success", async () => {
    const { runtime, patches } = createRuntime()
    const tool = getTool("canvas_batch_ops", runtime)

    const operations = JSON.stringify([
      { type: "set_pose", pose: "wave" },
      { type: "set_layer_variant", layer: "hair", variant: "INVALID" },
      { type: "set_animation", animation: "dance" },
    ])

    const result = await tool.execute("call_5", { operations })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.applied).toBe(2)
    expect(payload.errors).toBeDefined()
    expect((payload.errors as string[])).toHaveLength(1)
    expect(patches).toHaveLength(2)
  })

  it("accepts legacy 'op' field for backwards compatibility", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_batch_ops", runtime)

    const operations = JSON.stringify([
      { op: "set_pose", pose: "wave" },
    ])

    const result = await tool.execute("call_6", { operations })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.applied).toBe(1)
  })
})

// ============================================================================
// canvas_randomize_character
// ============================================================================

describe("canvas_randomize_character", () => {
  it("generates a random blueprint and emits patch", async () => {
    const { runtime, patches } = createRuntime()
    const tool = getTool("canvas_randomize_character", runtime)

    const result = await tool.execute("call_1", {})

    expect(result.error).toBeUndefined()
    expect(patches).toHaveLength(1)
    expect(patches[0].op.type).toBe("randomize_character")

    const payload = parseResult(result)
    expect(payload.version).toBe(2)
    expect(payload.changed).toBe(true)
    expect(payload.blueprint).toBeDefined()
  })

  it("produces a valid blueprint with valid palette preset", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_randomize_character", runtime)

    const result = await tool.execute("call_2", {})
    const payload = parseResult(result)
    const bp = payload.blueprint as CanvasCharacterBlueprint

    expect(bp.entityId).toBe("character_main")
    expect(Object.keys(CANVAS_PALETTE_PRESETS)).toContain(bp.palettePreset)
    expect(isHexColor(bp.layers.body.color)).toBe(true)
    expect(isHexColor(bp.layers.hair.color)).toBe(true)
  })
})

// ============================================================================
// canvas_describe_character
// ============================================================================

describe("canvas_describe_character", () => {
  it("includes all layer variants and colors in description", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_describe_character", runtime)

    const result = await tool.execute("call_1", {})
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.version).toBe(1)
    expect(typeof payload.description).toBe("string")

    const desc = payload.description as string
    expect(desc).toContain("Pose: idle")
    expect(desc).toContain("Animation: idle")
    expect(desc).toContain("Palette: classic")
    expect(desc).toContain("Body: base")
    expect(desc).toContain("Hair: short")
    expect(desc).toContain("Eyes: neutral")
    expect(desc).toContain("Outfit: hoodie")
    expect(desc).toContain("Accessory: none")
    expect(desc).toContain("#F5D0A9")
    expect(desc).toContain("#4A90D9")
  })

  it("marks hidden layers with [hidden]", async () => {
    const { runtime } = createRuntime()

    // First hide hair via set_layer_visibility
    const visTool = getTool("canvas_set_layer_visibility", runtime)
    await visTool.execute("setup", { layer: "hair", visible: false })

    const tool = getTool("canvas_describe_character", runtime)
    const result = await tool.execute("call_2", {})
    const payload = parseResult(result)
    const desc = payload.description as string

    expect(desc).toContain("Hair: short")
    expect(desc).toContain("[hidden]")
    // Body should NOT be hidden
    expect(desc).not.toMatch(/Body:.*\[hidden\]/)
  })
})

// ============================================================================
// canvas_adjust_color
// ============================================================================

describe("canvas_adjust_color", () => {
  it("lighten makes color lighter", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_adjust_color", runtime)

    const result = await tool.execute("call_1", {
      layer: "outfit",
      adjustment: "lighten",
      amount: 20,
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.adjustment).toBe("lighten")
    expect(payload.previousColor).toBe("#4A90D9")
    expect(typeof payload.newColor).toBe("string")
    expect(payload.newColor).not.toBe("#4A90D9")
    expect(isHexColor(payload.newColor as string)).toBe(true)
  })

  it("darken makes color darker", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_adjust_color", runtime)

    const result = await tool.execute("call_2", {
      layer: "body",
      adjustment: "darken",
      amount: 20,
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.adjustment).toBe("darken")
    expect(payload.previousColor).toBe("#F5D0A9")
    expect(payload.newColor).not.toBe("#F5D0A9")
    expect(isHexColor(payload.newColor as string)).toBe(true)
  })

  it("shift_hue changes the hue component", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_adjust_color", runtime)

    const result = await tool.execute("call_3", {
      layer: "outfit",
      adjustment: "shift_hue",
      amount: 180,
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.adjustment).toBe("shift_hue")
    expect(payload.newColor).not.toBe("#4A90D9")
    expect(isHexColor(payload.newColor as string)).toBe(true)
  })

  it("rejects invalid adjustment type", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_adjust_color", runtime)

    const result = await tool.execute("call_4", {
      layer: "outfit",
      adjustment: "invalid_adjust",
      amount: 20,
    })

    expect(result.error).toContain("Invalid adjustment")
  })

  it("rejects invalid layer", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_adjust_color", runtime)

    const result = await tool.execute("call_5", {
      layer: "not_a_layer",
      adjustment: "lighten",
      amount: 20,
    })

    expect(result.error).toContain("Invalid layer")
  })
})

// ============================================================================
// canvas_set_layer_visibility
// ============================================================================

describe("canvas_set_layer_visibility", () => {
  it("sets layer visibility to false", async () => {
    const { runtime, patches, getBlueprint } = createRuntime()
    const tool = getTool("canvas_set_layer_visibility", runtime)

    const result = await tool.execute("call_1", {
      layer: "hair",
      visible: false,
    })

    expect(result.error).toBeUndefined()
    expect(patches).toHaveLength(1)
    expect(patches[0].op.type).toBe("set_layer_visibility")
    expect(getBlueprint().visibility?.hair).toBe(false)
  })

  it("sets layer visibility to true", async () => {
    const { runtime, getBlueprint } = createRuntime()
    const tool = getTool("canvas_set_layer_visibility", runtime)

    // First hide, then show
    await tool.execute("call_2a", { layer: "eyes", visible: false })
    expect(getBlueprint().visibility?.eyes).toBe(false)

    await tool.execute("call_2b", { layer: "eyes", visible: true })
    expect(getBlueprint().visibility?.eyes).toBe(true)
  })

  it("requires visible boolean parameter", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_set_layer_visibility", runtime)

    const result = await tool.execute("call_3", {
      layer: "hair",
      // missing visible
    })

    expect(result.error).toContain("visible")
  })

  it("rejects invalid layer", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_set_layer_visibility", runtime)

    const result = await tool.execute("call_4", {
      layer: "invalid_layer",
      visible: false,
    })

    expect(result.error).toContain("Invalid layer")
  })
})

// ============================================================================
// canvas_cycle_variant
// ============================================================================

describe("canvas_cycle_variant", () => {
  it("cycles forward: short → spiky for hair", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_cycle_variant", runtime)

    const result = await tool.execute("call_1", {
      layer: "hair",
      direction: "next",
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.cycled).toBeDefined()
    const cycled = payload.cycled as { layer: string; from: string; to: string }
    expect(cycled.layer).toBe("hair")
    expect(cycled.from).toBe("short")
    expect(cycled.to).toBe("spiky")
  })

  it("cycles backward with wrap: short → messy for hair", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_cycle_variant", runtime)

    const result = await tool.execute("call_2", {
      layer: "hair",
      direction: "previous",
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    const cycled = payload.cycled as { layer: string; from: string; to: string }
    expect(cycled.from).toBe("short")
    expect(cycled.to).toBe(HAIR_VARIANTS[HAIR_VARIANTS.length - 1])
  })

  it("defaults to next direction when direction is omitted", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_cycle_variant", runtime)

    const result = await tool.execute("call_3", {
      layer: "hair",
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    const cycled = payload.cycled as { layer: string; from: string; to: string }
    expect(cycled.from).toBe("short")
    expect(cycled.to).toBe("spiky")
  })

  it("wraps forward: last variant → first variant", async () => {
    const { runtime } = createRuntime()
    // Set hair to "messy" first (last variant)
    const setTool = getTool("canvas_set_layer_variant", runtime)
    await setTool.execute("setup", { layer: "hair", variant: "messy" })

    const tool = getTool("canvas_cycle_variant", runtime)
    const result = await tool.execute("call_4", {
      layer: "hair",
      direction: "next",
    })
    const payload = parseResult(result)

    const cycled = payload.cycled as { layer: string; from: string; to: string }
    expect(cycled.from).toBe("messy")
    expect(cycled.to).toBe("short")
  })

  it("rejects invalid layer", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_cycle_variant", runtime)

    const result = await tool.execute("call_5", {
      layer: "invalid",
      direction: "next",
    })

    expect(result.error).toContain("Invalid layer")
  })
})

// ============================================================================
// canvas_import_blueprint
// ============================================================================

describe("canvas_import_blueprint", () => {
  it("imports complete blueprint and sets all fields", async () => {
    const { runtime, patches } = createRuntime()
    const tool = getTool("canvas_import_blueprint", runtime)

    const importData = {
      palettePreset: "ocean",
      pose: "wave",
      animation: "dance",
      layers: {
        body: { variant: "slim", color: "#F2C9A1" },
        hair: { variant: "spiky", color: "#123B5D" },
        eyes: { variant: "happy", color: "#0F2D49" },
        outfit: { variant: "jacket", color: "#1F7FBF" },
        accessory: { variant: "glasses", color: "#A6C8E0" },
      },
    }

    const result = await tool.execute("call_1", {
      blueprint: JSON.stringify(importData),
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.imported).toBe(true)
    expect(patches.length).toBeGreaterThan(0)

    const bp = payload.blueprint as CanvasCharacterBlueprint
    expect(bp.layers.body.variant).toBe("slim")
    expect(bp.layers.hair.variant).toBe("spiky")
    expect(bp.layers.eyes.variant).toBe("happy")
    expect(bp.layers.outfit.variant).toBe("jacket")
    expect(bp.layers.accessory.variant).toBe("glasses")
    expect(bp.layers.hair.color).toBe("#123B5D")
    expect(bp.pose).toBe("wave")
    expect(bp.animation).toBe("dance")
  })

  it("rejects invalid JSON", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_import_blueprint", runtime)

    const result = await tool.execute("call_2", {
      blueprint: "not valid json {{{",
    })

    expect(result.error).toContain("Invalid JSON")
  })

  it("rejects non-object JSON", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_import_blueprint", runtime)

    const result = await tool.execute("call_3", {
      blueprint: "\"just a string\"",
    })

    expect(result.error).toContain("JSON object")
  })

  it("handles partial blueprint with only some fields", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_import_blueprint", runtime)

    const importData = {
      pose: "celebrate",
      layers: {
        hair: { variant: "bob" },
      },
    }

    const result = await tool.execute("call_4", {
      blueprint: JSON.stringify(importData),
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.imported).toBe(true)

    const bp = payload.blueprint as CanvasCharacterBlueprint
    expect(bp.pose).toBe("celebrate")
    expect(bp.layers.hair.variant).toBe("bob")
  })

  it("ignores invalid layer variants in import", async () => {
    const { runtime } = createRuntime()
    const tool = getTool("canvas_import_blueprint", runtime)

    const importData = {
      layers: {
        hair: { variant: "INVALID_VARIANT", color: "#FF0000" },
      },
    }

    const result = await tool.execute("call_5", {
      blueprint: JSON.stringify(importData),
    })
    const payload = parseResult(result)

    expect(result.error).toBeUndefined()
    expect(payload.imported).toBe(true)
    // The color should still be applied even if variant was invalid
    const bp = payload.blueprint as CanvasCharacterBlueprint
    expect(bp.layers.hair.color).toBe("#FF0000")
  })
})
