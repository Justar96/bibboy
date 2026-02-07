import { describe, expect, it } from "vitest"
import {
  CANVAS_PALETTE_PRESETS,
  createDefaultCanvasBlueprint,
  isCanvasLayerVariant,
  isHexColor,
} from "../src/schemas/canvas"

describe("canvas schema helpers", () => {
  it("creates a default blueprint with palette colors", () => {
    const blueprint = createDefaultCanvasBlueprint("ocean")
    const palette = CANVAS_PALETTE_PRESETS.ocean

    expect(blueprint.palettePreset).toBe("ocean")
    expect(blueprint.layers.body.color).toBe(palette.skin)
    expect(blueprint.layers.outfit.color).toBe(palette.outfit)
  })

  it("validates layer variant by layer", () => {
    expect(isCanvasLayerVariant("hair", "spiky")).toBe(true)
    expect(isCanvasLayerVariant("hair", "hoodie")).toBe(false)
    expect(isCanvasLayerVariant("outfit", "hoodie")).toBe(true)
  })

  it("validates #RRGGBB colors", () => {
    expect(isHexColor("#4A90D9")).toBe(true)
    expect(isHexColor("#4a90d9")).toBe(true)
    expect(isHexColor("4A90D9")).toBe(false)
    expect(isHexColor("#FFF")).toBe(false)
  })
})
