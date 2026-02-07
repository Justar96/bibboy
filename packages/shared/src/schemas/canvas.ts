import { Schema } from "effect"

// ============================================================================
// Canvas Domain Constants
// ============================================================================

export const CANVAS_LAYER_IDS = [
  "body",
  "hair",
  "eyes",
  "outfit",
  "accessory",
] as const

export type CanvasLayerId = (typeof CANVAS_LAYER_IDS)[number]
export const CanvasLayerIdSchema = Schema.Literal(...CANVAS_LAYER_IDS)

export const BODY_VARIANTS = ["base", "slim"] as const
export const HAIR_VARIANTS = ["short", "spiky", "bob", "messy"] as const
export const EYES_VARIANTS = ["neutral", "happy", "closed"] as const
export const OUTFIT_VARIANTS = ["hoodie", "tshirt", "jacket"] as const
export const ACCESSORY_VARIANTS = ["none", "glasses", "cap"] as const

export type BodyVariant = (typeof BODY_VARIANTS)[number]
export type HairVariant = (typeof HAIR_VARIANTS)[number]
export type EyesVariant = (typeof EYES_VARIANTS)[number]
export type OutfitVariant = (typeof OUTFIT_VARIANTS)[number]
export type AccessoryVariant = (typeof ACCESSORY_VARIANTS)[number]

export const BodyVariantSchema = Schema.Literal(...BODY_VARIANTS)
export const HairVariantSchema = Schema.Literal(...HAIR_VARIANTS)
export const EyesVariantSchema = Schema.Literal(...EYES_VARIANTS)
export const OutfitVariantSchema = Schema.Literal(...OUTFIT_VARIANTS)
export const AccessoryVariantSchema = Schema.Literal(...ACCESSORY_VARIANTS)

export const CANVAS_POSE_IDS = ["idle", "wave", "sit", "celebrate"] as const
export type CanvasPoseId = (typeof CANVAS_POSE_IDS)[number]
export const CanvasPoseIdSchema = Schema.Literal(...CANVAS_POSE_IDS)

export const CANVAS_ANIMATION_IDS = [
  "idle",
  "talk",
  "walk",
  "dance",
  "celebrate",
] as const
export type CanvasAnimationId = (typeof CANVAS_ANIMATION_IDS)[number]
export const CanvasAnimationIdSchema = Schema.Literal(...CANVAS_ANIMATION_IDS)

export const CANVAS_PALETTE_PRESETS = {
  classic: {
    skin: "#F5D0A9",
    hair: "#1A1A1A",
    eyes: "#1A1A1A",
    outfit: "#4A90D9",
    accessory: "#999999",
  },
  ocean: {
    skin: "#F2C9A1",
    hair: "#123B5D",
    eyes: "#0F2D49",
    outfit: "#1F7FBF",
    accessory: "#A6C8E0",
  },
  sunset: {
    skin: "#F4C19B",
    hair: "#6A2D2D",
    eyes: "#4A2222",
    outfit: "#D86A3D",
    accessory: "#E3B29A",
  },
  forest: {
    skin: "#E8C19E",
    hair: "#2B3E2A",
    eyes: "#1D2A1C",
    outfit: "#4F8A4B",
    accessory: "#9FB79A",
  },
  mono: {
    skin: "#D0D0D0",
    hair: "#2A2A2A",
    eyes: "#111111",
    outfit: "#6B6B6B",
    accessory: "#9A9A9A",
  },
} as const

export type CanvasPalettePresetId = keyof typeof CANVAS_PALETTE_PRESETS
export const CanvasPalettePresetIdSchema = Schema.Literal(
  "classic",
  "ocean",
  "sunset",
  "forest",
  "mono"
)

export const HexColorSchema = Schema.String
export type HexColor = Schema.Schema.Type<typeof HexColorSchema>

// ============================================================================
// Blueprint Types
// ============================================================================

export const CanvasBodyLayerSchema = Schema.Struct({
  variant: BodyVariantSchema,
  color: HexColorSchema,
})

export const CanvasHairLayerSchema = Schema.Struct({
  variant: HairVariantSchema,
  color: HexColorSchema,
})

export const CanvasEyesLayerSchema = Schema.Struct({
  variant: EyesVariantSchema,
  color: HexColorSchema,
})

export const CanvasOutfitLayerSchema = Schema.Struct({
  variant: OutfitVariantSchema,
  color: HexColorSchema,
})

export const CanvasAccessoryLayerSchema = Schema.Struct({
  variant: AccessoryVariantSchema,
  color: HexColorSchema,
})

export const CanvasLayersSchema = Schema.Struct({
  body: CanvasBodyLayerSchema,
  hair: CanvasHairLayerSchema,
  eyes: CanvasEyesLayerSchema,
  outfit: CanvasOutfitLayerSchema,
  accessory: CanvasAccessoryLayerSchema,
})

export type CanvasLayers = Schema.Schema.Type<typeof CanvasLayersSchema>

export const CanvasLayerVisibilitySchema = Schema.Struct({
  body: Schema.Boolean,
  hair: Schema.Boolean,
  eyes: Schema.Boolean,
  outfit: Schema.Boolean,
  accessory: Schema.Boolean,
})

export type CanvasLayerVisibility = Schema.Schema.Type<typeof CanvasLayerVisibilitySchema>

export const DEFAULT_LAYER_VISIBILITY: CanvasLayerVisibility = {
  body: true,
  hair: true,
  eyes: true,
  outfit: true,
  accessory: true,
}

export const CanvasCharacterBlueprintSchema = Schema.Struct({
  entityId: Schema.String,
  palettePreset: CanvasPalettePresetIdSchema,
  pose: CanvasPoseIdSchema,
  animation: CanvasAnimationIdSchema,
  layers: CanvasLayersSchema,
  visibility: Schema.optional(CanvasLayerVisibilitySchema),
})

export type CanvasCharacterBlueprint = Schema.Schema.Type<typeof CanvasCharacterBlueprintSchema>

// ============================================================================
// Operation Types
// ============================================================================

export const CanvasSetBodyLayerVariantOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_variant"),
  layer: Schema.Literal("body"),
  variant: BodyVariantSchema,
})

export const CanvasSetHairLayerVariantOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_variant"),
  layer: Schema.Literal("hair"),
  variant: HairVariantSchema,
})

export const CanvasSetEyesLayerVariantOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_variant"),
  layer: Schema.Literal("eyes"),
  variant: EyesVariantSchema,
})

export const CanvasSetOutfitLayerVariantOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_variant"),
  layer: Schema.Literal("outfit"),
  variant: OutfitVariantSchema,
})

export const CanvasSetAccessoryLayerVariantOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_variant"),
  layer: Schema.Literal("accessory"),
  variant: AccessoryVariantSchema,
})

export const CanvasSetLayerVariantOpSchema = Schema.Union(
  CanvasSetBodyLayerVariantOpSchema,
  CanvasSetHairLayerVariantOpSchema,
  CanvasSetEyesLayerVariantOpSchema,
  CanvasSetOutfitLayerVariantOpSchema,
  CanvasSetAccessoryLayerVariantOpSchema
)

export const CanvasSetLayerColorOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_color"),
  layer: CanvasLayerIdSchema,
  color: HexColorSchema,
})

export const CanvasSetPaletteOpSchema = Schema.Struct({
  type: Schema.Literal("set_palette"),
  palette: CanvasPalettePresetIdSchema,
})

export const CanvasSetPoseOpSchema = Schema.Struct({
  type: Schema.Literal("set_pose"),
  pose: CanvasPoseIdSchema,
})

export const CanvasSetAnimationOpSchema = Schema.Struct({
  type: Schema.Literal("set_animation"),
  animation: CanvasAnimationIdSchema,
})

export const CanvasResetCharacterOpSchema = Schema.Struct({
  type: Schema.Literal("reset_character"),
})

export const CanvasUndoOpSchema = Schema.Struct({
  type: Schema.Literal("undo"),
})

export const CanvasSetLayerVisibilityOpSchema = Schema.Struct({
  type: Schema.Literal("set_layer_visibility"),
  layer: CanvasLayerIdSchema,
  visible: Schema.Boolean,
})

export const CanvasRandomizeCharacterOpSchema = Schema.Struct({
  type: Schema.Literal("randomize_character"),
})

export const CanvasOpSchema = Schema.Union(
  CanvasSetLayerVariantOpSchema,
  CanvasSetLayerColorOpSchema,
  CanvasSetPaletteOpSchema,
  CanvasSetPoseOpSchema,
  CanvasSetAnimationOpSchema,
  CanvasResetCharacterOpSchema,
  CanvasUndoOpSchema,
  CanvasSetLayerVisibilityOpSchema,
  CanvasRandomizeCharacterOpSchema
)

export type CanvasSetLayerVariantOp = Schema.Schema.Type<typeof CanvasSetLayerVariantOpSchema>
export type CanvasSetLayerColorOp = Schema.Schema.Type<typeof CanvasSetLayerColorOpSchema>
export type CanvasSetPaletteOp = Schema.Schema.Type<typeof CanvasSetPaletteOpSchema>
export type CanvasSetPoseOp = Schema.Schema.Type<typeof CanvasSetPoseOpSchema>
export type CanvasSetAnimationOp = Schema.Schema.Type<typeof CanvasSetAnimationOpSchema>
export type CanvasResetCharacterOp = Schema.Schema.Type<typeof CanvasResetCharacterOpSchema>
export type CanvasUndoOp = Schema.Schema.Type<typeof CanvasUndoOpSchema>
export type CanvasSetLayerVisibilityOp = Schema.Schema.Type<typeof CanvasSetLayerVisibilityOpSchema>
export type CanvasRandomizeCharacterOp = Schema.Schema.Type<typeof CanvasRandomizeCharacterOpSchema>
export type CanvasOp = Schema.Schema.Type<typeof CanvasOpSchema>

// ============================================================================
// Canvas Stream Payloads
// ============================================================================

export const CanvasStatePatchSchema = Schema.Struct({
  sessionId: Schema.String,
  version: Schema.Number,
  op: CanvasOpSchema,
  blueprint: CanvasCharacterBlueprintSchema,
})

export type CanvasStatePatch = Schema.Schema.Type<typeof CanvasStatePatchSchema>

export const CanvasStateSnapshotSchema = Schema.Struct({
  sessionId: Schema.String,
  version: Schema.Number,
  blueprint: CanvasCharacterBlueprintSchema,
})

export type CanvasStateSnapshot = Schema.Schema.Type<typeof CanvasStateSnapshotSchema>

// ============================================================================
// Runtime Guards & Helpers
// ============================================================================

const layerIdSet = new Set<string>(CANVAS_LAYER_IDS)
const poseIdSet = new Set<string>(CANVAS_POSE_IDS)
const animationIdSet = new Set<string>(CANVAS_ANIMATION_IDS)
const palettePresetSet = new Set<string>(Object.keys(CANVAS_PALETTE_PRESETS))

const layerVariantSets: Record<CanvasLayerId, Set<string>> = {
  body: new Set(BODY_VARIANTS),
  hair: new Set(HAIR_VARIANTS),
  eyes: new Set(EYES_VARIANTS),
  outfit: new Set(OUTFIT_VARIANTS),
  accessory: new Set(ACCESSORY_VARIANTS),
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

export const isCanvasLayerId = (value: string): value is CanvasLayerId =>
  layerIdSet.has(value)

export const isCanvasPoseId = (value: string): value is CanvasPoseId =>
  poseIdSet.has(value)

export const isCanvasAnimationId = (value: string): value is CanvasAnimationId =>
  animationIdSet.has(value)

export const isCanvasPalettePresetId = (value: string): value is CanvasPalettePresetId =>
  palettePresetSet.has(value)

export const isCanvasLayerVariant = (
  layer: CanvasLayerId,
  variant: string
): boolean => layerVariantSets[layer].has(variant)

export const isBodyVariant = (v: string): v is BodyVariant => layerVariantSets.body.has(v)
export const isHairVariant = (v: string): v is HairVariant => layerVariantSets.hair.has(v)
export const isEyesVariant = (v: string): v is EyesVariant => layerVariantSets.eyes.has(v)
export const isOutfitVariant = (v: string): v is OutfitVariant => layerVariantSets.outfit.has(v)
export const isAccessoryVariant = (v: string): v is AccessoryVariant => layerVariantSets.accessory.has(v)

export const isHexColor = (value: string): boolean => HEX_COLOR_REGEX.test(value)

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function createRandomCanvasBlueprint(): CanvasCharacterBlueprint {
  const paletteKeys = Object.keys(CANVAS_PALETTE_PRESETS) as CanvasPalettePresetId[]
  const palettePreset = randomElement(paletteKeys)
  const palette = CANVAS_PALETTE_PRESETS[palettePreset]

  return {
    entityId: "character_main",
    palettePreset,
    pose: randomElement(CANVAS_POSE_IDS),
    animation: randomElement(CANVAS_ANIMATION_IDS),
    layers: {
      body: { variant: randomElement(BODY_VARIANTS), color: palette.skin },
      hair: { variant: randomElement(HAIR_VARIANTS), color: palette.hair },
      eyes: { variant: randomElement(EYES_VARIANTS), color: palette.eyes },
      outfit: { variant: randomElement(OUTFIT_VARIANTS), color: palette.outfit },
      accessory: { variant: randomElement(ACCESSORY_VARIANTS), color: palette.accessory },
    },
  }
}

export function createDefaultCanvasBlueprint(
  palettePreset: CanvasPalettePresetId = "classic"
): CanvasCharacterBlueprint {
  const palette = CANVAS_PALETTE_PRESETS[palettePreset]

  return {
    entityId: "character_main",
    palettePreset,
    pose: "idle",
    animation: "idle",
    layers: {
      body: { variant: "base", color: palette.skin },
      hair: { variant: "short", color: palette.hair },
      eyes: { variant: "neutral", color: palette.eyes },
      outfit: { variant: "hoodie", color: palette.outfit },
      accessory: { variant: "none", color: palette.accessory },
    },
  }
}
