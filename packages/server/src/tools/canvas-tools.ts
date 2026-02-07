import type {
  CanvasAnimationId,
  CanvasCharacterBlueprint,
  CanvasLayerId,
  CanvasOp,
  CanvasPalettePresetId,
  CanvasPoseId,
} from "@bibboy/shared"
import {
  BODY_VARIANTS,
  HAIR_VARIANTS,
  EYES_VARIANTS,
  OUTFIT_VARIANTS,
  ACCESSORY_VARIANTS,
  CANVAS_ANIMATION_IDS,
  CANVAS_LAYER_IDS,
  CANVAS_PALETTE_PRESETS,
  CANVAS_POSE_IDS,
  isCanvasAnimationId,
  isCanvasLayerId,
  isCanvasLayerVariant,
  isCanvasPalettePresetId,
  isCanvasPoseId,
  isHexColor,
  isBodyVariant,
  isHairVariant,
  isEyesVariant,
  isOutfitVariant,
  isAccessoryVariant,
} from "@bibboy/shared"
import type { AgentTool } from "./types"
import { errorResult, jsonResult, readStringParam, readNumberParam, readBooleanParam } from "./types"

export interface CanvasToolRuntime {
  readonly sessionId: string
  readonly getState: () => Promise<{ version: number; blueprint: CanvasCharacterBlueprint }>
  readonly applyOperation: (
    op: CanvasOp
  ) => Promise<{ version: number; blueprint: CanvasCharacterBlueprint; changed: boolean }>
  readonly exportBlueprint: () => Promise<CanvasCharacterBlueprint>
  readonly emitPatch: (payload: {
    sessionId: string
    version: number
    op: CanvasOp
    blueprint: CanvasCharacterBlueprint
  }) => void
}

function asLayerId(value: string): CanvasLayerId | null {
  return isCanvasLayerId(value) ? value : null
}

function asPose(value: string): CanvasPoseId | null {
  return isCanvasPoseId(value) ? value : null
}

function asAnimation(value: string): CanvasAnimationId | null {
  return isCanvasAnimationId(value) ? value : null
}

function asPalette(value: string): CanvasPalettePresetId | null {
  return isCanvasPalettePresetId(value) ? value : null
}

function buildStatePayload(
  state: { version: number; blueprint: CanvasCharacterBlueprint },
  changed?: boolean
): Record<string, unknown> {
  return {
    version: state.version,
    blueprint: state.blueprint,
    ...(changed !== undefined ? { changed } : {}),
  }
}

async function applyAndEmit(
  runtime: CanvasToolRuntime,
  op: CanvasOp
): Promise<ReturnType<typeof buildStatePayload>> {
  const result = await runtime.applyOperation(op)
  if (result.changed) {
    runtime.emitPatch({
      sessionId: runtime.sessionId,
      version: result.version,
      op,
      blueprint: result.blueprint,
    })
  }
  return buildStatePayload(result, result.changed)
}

function buildSetLayerVariantOp(
  layer: CanvasLayerId,
  variant: string
): CanvasOp | null {
  switch (layer) {
    case "body":
      return isBodyVariant(variant) ? { type: "set_layer_variant", layer, variant } : null
    case "hair":
      return isHairVariant(variant) ? { type: "set_layer_variant", layer, variant } : null
    case "eyes":
      return isEyesVariant(variant) ? { type: "set_layer_variant", layer, variant } : null
    case "outfit":
      return isOutfitVariant(variant) ? { type: "set_layer_variant", layer, variant } : null
    case "accessory":
      return isAccessoryVariant(variant) ? { type: "set_layer_variant", layer, variant } : null
    default: {
      const neverLayer: never = layer
      throw new Error(`Unhandled layer: ${neverLayer}`)
    }
  }
}

function setLayerVariantTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Set Layer Variant",
    name: "canvas_set_layer_variant",
    description:
      "Set a character layer variant (body, hair, eyes, outfit, accessory) using supported variant names.",
    parameters: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description: "Layer to modify.",
          enum: [...CANVAS_LAYER_IDS],
        },
        variant: {
          type: "string",
          description: "Variant for that layer.",
        },
      },
      required: ["layer", "variant"],
    },
    execute: async (_toolCallId, args) => {
      const layerValue = readStringParam(args, "layer", { required: true })
      const variant = readStringParam(args, "variant", { required: true })
      const layer = asLayerId(layerValue)

      if (!layer) {
        return errorResult(`Invalid layer "${layerValue}".`)
      }
      if (!isCanvasLayerVariant(layer, variant)) {
        return errorResult(
          `Invalid variant "${variant}" for layer "${layer}".`
        )
      }

      const op = buildSetLayerVariantOp(layer, variant)
      if (!op) {
        return errorResult("Failed to build canvas operation.")
      }

      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function setLayerColorTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Set Layer Color",
    name: "canvas_set_layer_color",
    description: "Set a layer color with hex format #RRGGBB.",
    parameters: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description: "Layer to recolor.",
          enum: [...CANVAS_LAYER_IDS],
        },
        color: {
          type: "string",
          description: "Hex color like #4A90D9.",
        },
      },
      required: ["layer", "color"],
    },
    execute: async (_toolCallId, args) => {
      const layerValue = readStringParam(args, "layer", { required: true })
      const color = readStringParam(args, "color", { required: true })
      const layer = asLayerId(layerValue)

      if (!layer) {
        return errorResult(`Invalid layer "${layerValue}".`)
      }
      if (!isHexColor(color)) {
        return errorResult(`Invalid color "${color}". Expected #RRGGBB.`)
      }

      const op: CanvasOp = {
        type: "set_layer_color",
        layer,
        color: color.toUpperCase(),
      }

      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function setPaletteTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Set Palette",
    name: "canvas_set_palette",
    description: "Apply a named palette preset to the character.",
    parameters: {
      type: "object",
      properties: {
        palette: {
          type: "string",
          description: "Palette preset name.",
          enum: Object.keys(CANVAS_PALETTE_PRESETS),
        },
      },
      required: ["palette"],
    },
    execute: async (_toolCallId, args) => {
      const paletteValue = readStringParam(args, "palette", { required: true })
      const palette = asPalette(paletteValue)
      if (!palette) {
        return errorResult(`Invalid palette "${paletteValue}".`)
      }

      const op: CanvasOp = { type: "set_palette", palette }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function setPoseTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Set Pose",
    name: "canvas_set_pose",
    description: "Set the visible pose for the target character.",
    parameters: {
      type: "object",
      properties: {
        pose: {
          type: "string",
          description: "Pose id.",
          enum: [...CANVAS_POSE_IDS],
        },
      },
      required: ["pose"],
    },
    execute: async (_toolCallId, args) => {
      const poseValue = readStringParam(args, "pose", { required: true })
      const pose = asPose(poseValue)
      if (!pose) {
        return errorResult(`Invalid pose "${poseValue}".`)
      }

      const op: CanvasOp = { type: "set_pose", pose }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function setAnimationTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Set Animation",
    name: "canvas_set_animation",
    description: "Set the current animation state for the character.",
    parameters: {
      type: "object",
      properties: {
        animation: {
          type: "string",
          description: "Animation id.",
          enum: [...CANVAS_ANIMATION_IDS],
        },
      },
      required: ["animation"],
    },
    execute: async (_toolCallId, args) => {
      const animationValue = readStringParam(args, "animation", {
        required: true,
      })
      const animation = asAnimation(animationValue)
      if (!animation) {
        return errorResult(`Invalid animation "${animationValue}".`)
      }

      const op: CanvasOp = { type: "set_animation", animation }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function resetCharacterTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Reset Character",
    name: "canvas_reset_character",
    description:
      "Reset the character blueprint to defaults. Requires confirm=true.",
    parameters: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to perform a reset.",
        },
      },
      required: ["confirm"],
    },
    execute: async (_toolCallId, args) => {
      if (args.confirm !== true) {
        return errorResult("Reset not confirmed. Set confirm=true.")
      }

      const op: CanvasOp = { type: "reset_character" }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function undoTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Undo",
    name: "canvas_undo",
    description: "Undo the latest canvas mutation for this session.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const op: CanvasOp = { type: "undo" }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function getStateTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Get State",
    name: "canvas_get_state",
    description: "Return current character builder state for this session.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const state = await runtime.getState()
      return jsonResult(buildStatePayload(state))
    },
  }
}

function exportBlueprintTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Export Blueprint",
    name: "canvas_export_blueprint",
    description: "Export current blueprint JSON for persistence or reuse.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const blueprint = await runtime.exportBlueprint()
      return jsonResult({ blueprint })
    },
  }
}

// ============================================================================
// HSL Color Utilities
// ============================================================================

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  if (s === 0) {
    const v = Math.round(l * 255)
    const hex = v.toString(16).padStart(2, "0")
    return `#${hex}${hex}${hex}`.toUpperCase()
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  const rv = Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255)
  const gv = Math.round(hue2rgb(p, q, h / 360) * 255)
  const bv = Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255)

  return `#${rv.toString(16).padStart(2, "0")}${gv.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`.toUpperCase()
}

// ============================================================================
// Variant Helpers
// ============================================================================

function getVariantsForLayer(layer: CanvasLayerId): readonly string[] {
  switch (layer) {
    case "body": return BODY_VARIANTS
    case "hair": return HAIR_VARIANTS
    case "eyes": return EYES_VARIANTS
    case "outfit": return OUTFIT_VARIANTS
    case "accessory": return ACCESSORY_VARIANTS
  }
}

// ============================================================================
// Batch Ops Parser
// ============================================================================

function parseBatchOp(entry: Record<string, unknown>): CanvasOp | null {
  const opType = typeof entry.type === "string" ? entry.type : (typeof entry.op === "string" ? entry.op : "")

  switch (opType) {
    case "set_layer_variant": {
      const layer = typeof entry.layer === "string" ? entry.layer : ""
      const variant = typeof entry.variant === "string" ? entry.variant : ""
      if (!isCanvasLayerId(layer) || !isCanvasLayerVariant(layer, variant)) return null
      return buildSetLayerVariantOp(layer, variant)
    }
    case "set_layer_color": {
      const layer = typeof entry.layer === "string" ? entry.layer : ""
      const color = typeof entry.color === "string" ? entry.color : ""
      if (!isCanvasLayerId(layer) || !isHexColor(color)) return null
      return { type: "set_layer_color", layer, color: color.toUpperCase() }
    }
    case "set_palette": {
      const palette = typeof entry.palette === "string" ? entry.palette : ""
      if (!isCanvasPalettePresetId(palette)) return null
      return { type: "set_palette", palette }
    }
    case "set_pose": {
      const pose = typeof entry.pose === "string" ? entry.pose : ""
      if (!isCanvasPoseId(pose)) return null
      return { type: "set_pose", pose }
    }
    case "set_animation": {
      const animation = typeof entry.animation === "string" ? entry.animation : ""
      if (!isCanvasAnimationId(animation)) return null
      return { type: "set_animation", animation }
    }
    case "set_layer_visibility": {
      const layer = typeof entry.layer === "string" ? entry.layer : ""
      const visible = typeof entry.visible === "boolean" ? entry.visible : null
      if (!isCanvasLayerId(layer) || visible === null) return null
      return { type: "set_layer_visibility", layer, visible }
    }
    default:
      return null
  }
}

// ============================================================================
// New Canvas Tools
// ============================================================================

const COLOR_ADJUSTMENTS = ["lighten", "darken", "saturate", "desaturate", "shift_hue"] as const
type ColorAdjustment = (typeof COLOR_ADJUSTMENTS)[number]

function isColorAdjustment(value: string): value is ColorAdjustment {
  return (COLOR_ADJUSTMENTS as readonly string[]).includes(value)
}

function batchOpsTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Batch Ops",
    name: "canvas_batch_ops",
    description:
      'Apply multiple canvas operations in a single call. Send a JSON array of operations (max 20). ' +
      'Each operation object needs a "type" field plus relevant params. ' +
      'Supported types: set_layer_variant (layer, variant), set_layer_color (layer, color), ' +
      'set_palette (palette), set_pose (pose), set_animation (animation), ' +
      'set_layer_visibility (layer, visible). ' +
      'Example: [{"type":"set_layer_variant","layer":"hair","variant":"spiky"},{"type":"set_pose","pose":"wave"}]',
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "string",
          description:
            'JSON array of operations (max 20). Example: [{"type":"set_layer_variant","layer":"hair","variant":"spiky"},{"type":"set_layer_color","layer":"outfit","color":"#FF5500"}]',
        },
      },
      required: ["operations"],
    },
    execute: async (_toolCallId, args) => {
      const raw = readStringParam(args, "operations", { required: true })
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return errorResult("Invalid JSON. Expected a JSON array of operations.")
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return errorResult("Expected a non-empty array of operations.")
      }

      if (parsed.length > 20) {
        return errorResult("Too many operations. Maximum 20 per batch.")
      }

      const ops: CanvasOp[] = []
      const errors: string[] = []

      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i]
        if (!item || typeof item !== "object") {
          errors.push(`[${i}]: not an object`)
          continue
        }
        const entry = item as Record<string, unknown>
        const op = parseBatchOp(entry)
        if (op) {
          ops.push(op)
        } else {
          const opType = typeof entry.type === "string" ? entry.type : (typeof entry.op === "string" ? entry.op : "unknown")
          errors.push(`[${i}]: invalid operation "${opType}"`)
        }
      }

      if (ops.length === 0) {
        return errorResult(`No valid operations parsed. Errors: ${errors.join(", ")}`)
      }

      let lastPayload: Record<string, unknown> = {}
      for (const op of ops) {
        lastPayload = await applyAndEmit(runtime, op)
      }

      return jsonResult({
        ...lastPayload,
        applied: ops.length,
        ...(errors.length > 0 ? { errors } : {}),
      })
    },
  }
}

function randomizeCharacterTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Randomize",
    name: "canvas_randomize_character",
    description:
      "Generate a completely random character — random body, hair, eyes, outfit, accessory variants with a random palette preset, pose, and animation. Great for inspiration or starting fresh.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const op: CanvasOp = { type: "randomize_character" }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function describeCharacterTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Describe",
    name: "canvas_describe_character",
    description:
      "Get a human-readable text description of the current character's appearance, including all layer variants, colors, pose, animation, and visibility.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const state = await runtime.getState()
      const bp = state.blueprint
      const vis = bp.visibility

      const lines: string[] = [
        `Pose: ${bp.pose} | Animation: ${bp.animation} | Palette: ${bp.palettePreset}`,
        `Body: ${bp.layers.body.variant} (${bp.layers.body.color})${vis?.body === false ? " [hidden]" : ""}`,
        `Hair: ${bp.layers.hair.variant} (${bp.layers.hair.color})${vis?.hair === false ? " [hidden]" : ""}`,
        `Eyes: ${bp.layers.eyes.variant} (${bp.layers.eyes.color})${vis?.eyes === false ? " [hidden]" : ""}`,
        `Outfit: ${bp.layers.outfit.variant} (${bp.layers.outfit.color})${vis?.outfit === false ? " [hidden]" : ""}`,
        `Accessory: ${bp.layers.accessory.variant} (${bp.layers.accessory.color})${vis?.accessory === false ? " [hidden]" : ""}`,
      ]

      return jsonResult({
        description: lines.join("\n"),
        version: state.version,
      })
    },
  }
}

function adjustColorTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Adjust Color",
    name: "canvas_adjust_color",
    description:
      "Adjust a layer's color using HSL operations: lighten, darken, saturate, desaturate, or shift_hue. " +
      "Amount is 0–100 (percent for lightness/saturation) or 0–360 (degrees for hue shift).",
    parameters: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description: "Layer to adjust.",
          enum: [...CANVAS_LAYER_IDS],
        },
        adjustment: {
          type: "string",
          description: "Type of color adjustment.",
          enum: [...COLOR_ADJUSTMENTS],
        },
        amount: {
          type: "number",
          description:
            "Adjustment amount: 0–100 for lighten/darken/saturate/desaturate (percent of range), 0–360 for shift_hue (degrees).",
          minimum: 0,
          maximum: 360,
        },
      },
      required: ["layer", "adjustment", "amount"],
    },
    execute: async (_toolCallId, args) => {
      const layerValue = readStringParam(args, "layer", { required: true })
      const adjustmentValue = readStringParam(args, "adjustment", { required: true })
      const amount = readNumberParam(args, "amount", { min: 0, max: 360 }) ?? 10

      const layer = asLayerId(layerValue)
      if (!layer) return errorResult(`Invalid layer "${layerValue}".`)

      if (!isColorAdjustment(adjustmentValue)) {
        return errorResult(
          `Invalid adjustment "${adjustmentValue}". Valid: ${COLOR_ADJUSTMENTS.join(", ")}`
        )
      }

      const state = await runtime.getState()
      const currentColor = state.blueprint.layers[layer].color
      const [h, s, l] = hexToHsl(currentColor)

      let newH = h
      let newS = s
      let newL = l
      const pct = amount / 100

      switch (adjustmentValue) {
        case "lighten":
          newL = Math.min(1, l + pct)
          break
        case "darken":
          newL = Math.max(0, l - pct)
          break
        case "saturate":
          newS = Math.min(1, s + pct)
          break
        case "desaturate":
          newS = Math.max(0, s - pct)
          break
        case "shift_hue":
          newH = (h + amount) % 360
          break
      }

      const newColor = hslToHex(newH, newS, newL)
      const op: CanvasOp = { type: "set_layer_color", layer, color: newColor }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult({
        ...payload,
        adjustment: adjustmentValue,
        previousColor: currentColor,
        newColor,
      })
    },
  }
}

function setLayerVisibilityTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Layer Visibility",
    name: "canvas_set_layer_visibility",
    description:
      "Show or hide a character layer. Hidden layers are not rendered on the canvas.",
    parameters: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description: "Layer to toggle.",
          enum: [...CANVAS_LAYER_IDS],
        },
        visible: {
          type: "boolean",
          description: "true = show layer, false = hide layer.",
        },
      },
      required: ["layer", "visible"],
    },
    execute: async (_toolCallId, args) => {
      const layerValue = readStringParam(args, "layer", { required: true })
      const visible = readBooleanParam(args, "visible")

      const layer = asLayerId(layerValue)
      if (!layer) return errorResult(`Invalid layer "${layerValue}".`)
      if (visible === undefined) {
        return errorResult("visible parameter is required (true or false).")
      }

      const op: CanvasOp = { type: "set_layer_visibility", layer, visible }
      const payload = await applyAndEmit(runtime, op)
      return jsonResult(payload)
    },
  }
}

function cycleVariantTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Cycle Variant",
    name: "canvas_cycle_variant",
    description:
      "Cycle to the next (or previous) variant for a character layer. Wraps around after the last variant.",
    parameters: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description: "Layer to cycle.",
          enum: [...CANVAS_LAYER_IDS],
        },
        direction: {
          type: "string",
          description: "Cycle direction.",
          enum: ["next", "previous"],
        },
      },
      required: ["layer"],
    },
    execute: async (_toolCallId, args) => {
      const layerValue = readStringParam(args, "layer", { required: true })
      const direction = readStringParam(args, "direction") || "next"

      const layer = asLayerId(layerValue)
      if (!layer) return errorResult(`Invalid layer "${layerValue}".`)

      const state = await runtime.getState()
      const currentVariant = state.blueprint.layers[layer].variant
      const variants = getVariantsForLayer(layer)
      const currentIdx = variants.indexOf(currentVariant)

      let nextIdx: number
      if (direction === "previous") {
        nextIdx = currentIdx <= 0 ? variants.length - 1 : currentIdx - 1
      } else {
        nextIdx = (currentIdx + 1) % variants.length
      }

      const nextVariant = variants[nextIdx]
      const op = buildSetLayerVariantOp(layer, nextVariant)
      if (!op) return errorResult("Failed to build variant operation.")

      const payload = await applyAndEmit(runtime, op)
      return jsonResult({
        ...payload,
        cycled: { layer, from: currentVariant, to: nextVariant },
      })
    },
  }
}

function importBlueprintTool(runtime: CanvasToolRuntime): AgentTool {
  return {
    label: "Canvas Import Blueprint",
    name: "canvas_import_blueprint",
    description:
      'Import a complete character blueprint JSON to replace the current state. ' +
      'Accepts a JSON object with palettePreset, pose, animation, and layers fields. ' +
      'Applies a reset first, then sets all fields from the import.',
    parameters: {
      type: "object",
      properties: {
        blueprint: {
          type: "string",
          description:
            'Blueprint JSON object, e.g. {"palettePreset":"ocean","pose":"wave","animation":"dance","layers":{"body":{"variant":"slim","color":"#F2C9A1"},"hair":{"variant":"spiky","color":"#123B5D"},"eyes":{"variant":"happy","color":"#0F2D49"},"outfit":{"variant":"jacket","color":"#1F7FBF"},"accessory":{"variant":"glasses","color":"#A6C8E0"}}}',
        },
      },
      required: ["blueprint"],
    },
    execute: async (_toolCallId, args) => {
      const raw = readStringParam(args, "blueprint", { required: true })
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return errorResult("Invalid JSON. Expected a blueprint object.")
      }

      if (!parsed || typeof parsed !== "object") {
        return errorResult("Expected a JSON object.")
      }

      const bp = parsed as Record<string, unknown>
      const ops: CanvasOp[] = []

      ops.push({ type: "reset_character" })

      if (
        typeof bp.palettePreset === "string" &&
        isCanvasPalettePresetId(bp.palettePreset)
      ) {
        ops.push({ type: "set_palette", palette: bp.palettePreset })
      }

      if (bp.layers && typeof bp.layers === "object") {
        const layers = bp.layers as Record<string, Record<string, unknown>>
        for (const layerKey of CANVAS_LAYER_IDS) {
          const layerData = layers[layerKey]
          if (!layerData) continue

          if (
            typeof layerData.variant === "string" &&
            isCanvasLayerVariant(layerKey, layerData.variant)
          ) {
            const op = buildSetLayerVariantOp(layerKey, layerData.variant)
            if (op) ops.push(op)
          }

          if (
            typeof layerData.color === "string" &&
            isHexColor(layerData.color)
          ) {
            ops.push({
              type: "set_layer_color",
              layer: layerKey,
              color: layerData.color.toUpperCase(),
            })
          }
        }
      }

      if (typeof bp.pose === "string" && isCanvasPoseId(bp.pose)) {
        ops.push({ type: "set_pose", pose: bp.pose })
      }

      if (
        typeof bp.animation === "string" &&
        isCanvasAnimationId(bp.animation)
      ) {
        ops.push({ type: "set_animation", animation: bp.animation })
      }

      let lastPayload: Record<string, unknown> = {}
      for (const op of ops) {
        lastPayload = await applyAndEmit(runtime, op)
      }

      if (Object.keys(lastPayload).length === 0) {
        const state = await runtime.getState()
        lastPayload = buildStatePayload(state)
      }

      return jsonResult({ ...lastPayload, imported: true })
    },
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCanvasTools(runtime: CanvasToolRuntime): AgentTool[] {
  return [
    getStateTool(runtime),
    setLayerVariantTool(runtime),
    setLayerColorTool(runtime),
    setPaletteTool(runtime),
    setPoseTool(runtime),
    setAnimationTool(runtime),
    resetCharacterTool(runtime),
    undoTool(runtime),
    exportBlueprintTool(runtime),
    batchOpsTool(runtime),
    randomizeCharacterTool(runtime),
    describeCharacterTool(runtime),
    adjustColorTool(runtime),
    setLayerVisibilityTool(runtime),
    cycleVariantTool(runtime),
    importBlueprintTool(runtime),
  ]
}
