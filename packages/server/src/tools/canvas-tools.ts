import type {
  CanvasAnimationId,
  CanvasCharacterBlueprint,
  CanvasLayerId,
  CanvasOp,
  CanvasPalettePresetId,
  CanvasPoseId,
} from "@bibboy/shared"
import {
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
import { errorResult, jsonResult, readStringParam } from "./types"

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
  ]
}
