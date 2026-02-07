import { describe, expect, it } from "vitest"
import type { CanvasCharacterBlueprint, CanvasOp } from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"
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
        if (op.type === "set_layer_variant") {
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
        } else if (op.type === "reset_character") {
          blueprint = createDefaultCanvasBlueprint()
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
  }
}

describe("canvas tools", () => {
  it("rejects invalid layer variants", async () => {
    const { runtime } = createRuntime()
    const tool = createCanvasTools(runtime).find(
      (t) => t.name === "canvas_set_layer_variant"
    )
    if (!tool) {
      throw new Error("canvas_set_layer_variant tool not found")
    }

    const result = await tool.execute("call_1", {
      layer: "hair",
      variant: "not-valid",
    })

    expect(result.error).toContain("Invalid variant")
  })

  it("applies valid layer variant changes and emits patch", async () => {
    const { runtime, patches } = createRuntime()
    const tool = createCanvasTools(runtime).find(
      (t) => t.name === "canvas_set_layer_variant"
    )
    if (!tool) {
      throw new Error("canvas_set_layer_variant tool not found")
    }

    const result = await tool.execute("call_2", {
      layer: "hair",
      variant: "spiky",
    })

    expect(result.error).toBeUndefined()
    expect(patches).toHaveLength(1)
    expect(patches[0]?.op.type).toBe("set_layer_variant")
  })

  it("requires confirm=true for reset", async () => {
    const { runtime } = createRuntime()
    const tool = createCanvasTools(runtime).find(
      (t) => t.name === "canvas_reset_character"
    )
    if (!tool) {
      throw new Error("canvas_reset_character tool not found")
    }

    const result = await tool.execute("call_3", { confirm: false })
    expect(result.error).toContain("Reset not confirmed")
  })
})
