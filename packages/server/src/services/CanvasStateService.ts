import { Effect, HashMap, Ref, Option } from "effect"
import type {
  CanvasCharacterBlueprint,
  CanvasLayerId,
  CanvasOp,
} from "@bibboy/shared"
import {
  CANVAS_PALETTE_PRESETS,
  createDefaultCanvasBlueprint,
  isHexColor,
} from "@bibboy/shared"

const DEFAULT_MAX_HISTORY = 30

interface CanvasSessionState {
  version: number
  blueprint: CanvasCharacterBlueprint
  history: CanvasCharacterBlueprint[]
}

interface CanvasStateStore {
  sessions: HashMap.HashMap<string, CanvasSessionState>
}

export interface CanvasApplyResult {
  readonly version: number
  readonly blueprint: CanvasCharacterBlueprint
  readonly changed: boolean
}

export interface CanvasSnapshot {
  readonly version: number
  readonly blueprint: CanvasCharacterBlueprint
}

export interface CanvasStateServiceInterface {
  readonly getSnapshot: (
    sessionId: string
  ) => Effect.Effect<Option.Option<CanvasSnapshot>>

  readonly ensureSession: (
    sessionId: string
  ) => Effect.Effect<CanvasSnapshot>

  readonly applyOperation: (
    sessionId: string,
    op: CanvasOp
  ) => Effect.Effect<CanvasApplyResult, Error>

  readonly exportBlueprint: (
    sessionId: string
  ) => Effect.Effect<CanvasCharacterBlueprint>

  readonly clearSession: (
    sessionId: string
  ) => Effect.Effect<void>

  readonly pruneSessions: (
    activeSessionIds: readonly string[]
  ) => Effect.Effect<number>
}

function cloneBlueprint(blueprint: CanvasCharacterBlueprint): CanvasCharacterBlueprint {
  return {
    ...blueprint,
    layers: {
      body: { ...blueprint.layers.body },
      hair: { ...blueprint.layers.hair },
      eyes: { ...blueprint.layers.eyes },
      outfit: { ...blueprint.layers.outfit },
      accessory: { ...blueprint.layers.accessory },
    },
  }
}

function applyPalette(
  blueprint: CanvasCharacterBlueprint,
  paletteName: keyof typeof CANVAS_PALETTE_PRESETS
): CanvasCharacterBlueprint {
  const palette = CANVAS_PALETTE_PRESETS[paletteName]
  return {
    ...blueprint,
    palettePreset: paletteName,
    layers: {
      ...blueprint.layers,
      body: { ...blueprint.layers.body, color: palette.skin },
      hair: { ...blueprint.layers.hair, color: palette.hair },
      eyes: { ...blueprint.layers.eyes, color: palette.eyes },
      outfit: { ...blueprint.layers.outfit, color: palette.outfit },
      accessory: { ...blueprint.layers.accessory, color: palette.accessory },
    },
  }
}

function setLayerColor(
  blueprint: CanvasCharacterBlueprint,
  layer: CanvasLayerId,
  color: string
): CanvasCharacterBlueprint {
  if (!isHexColor(color)) {
    throw new Error(`Invalid color "${color}". Expected #RRGGBB.`)
  }

  return {
    ...blueprint,
    layers: {
      ...blueprint.layers,
      [layer]: {
        ...blueprint.layers[layer],
        color: color.toUpperCase(),
      },
    },
  }
}

function applyOpToBlueprint(
  state: CanvasSessionState,
  op: CanvasOp
): { nextState: CanvasSessionState; changed: boolean } {
  if (op.type === "undo") {
    const previous = state.history[state.history.length - 1]
    if (!previous) {
      return { nextState: state, changed: false }
    }

    return {
      changed: true,
      nextState: {
        version: state.version + 1,
        blueprint: cloneBlueprint(previous),
        history: state.history.slice(0, -1),
      },
    }
  }

  let nextBlueprint = cloneBlueprint(state.blueprint)

  switch (op.type) {
    case "set_layer_variant": {
      nextBlueprint = {
        ...nextBlueprint,
        layers: {
          ...nextBlueprint.layers,
          [op.layer]: {
            ...nextBlueprint.layers[op.layer],
            variant: op.variant,
          },
        },
      }
      break
    }
    case "set_layer_color": {
      nextBlueprint = setLayerColor(nextBlueprint, op.layer, op.color)
      break
    }
    case "set_palette": {
      nextBlueprint = applyPalette(nextBlueprint, op.palette)
      break
    }
    case "set_pose": {
      nextBlueprint = { ...nextBlueprint, pose: op.pose }
      break
    }
    case "set_animation": {
      nextBlueprint = { ...nextBlueprint, animation: op.animation }
      break
    }
    case "reset_character": {
      nextBlueprint = createDefaultCanvasBlueprint()
      break
    }
    default: {
      const neverOp: never = op
      throw new Error(`Unhandled canvas operation: ${JSON.stringify(neverOp)}`)
    }
  }

  const changed = JSON.stringify(nextBlueprint) !== JSON.stringify(state.blueprint)
  if (!changed) {
    return { nextState: state, changed: false }
  }

  const nextHistory = [...state.history, cloneBlueprint(state.blueprint)]
  const trimmedHistory =
    nextHistory.length > DEFAULT_MAX_HISTORY
      ? nextHistory.slice(nextHistory.length - DEFAULT_MAX_HISTORY)
      : nextHistory

  return {
    changed: true,
    nextState: {
      version: state.version + 1,
      blueprint: nextBlueprint,
      history: trimmedHistory,
    },
  }
}

export class CanvasStateService extends Effect.Service<CanvasStateService>()(
  "CanvasStateService",
  {
    effect: Effect.gen(function* () {
      const stateRef = yield* Ref.make<CanvasStateStore>({
        sessions: HashMap.empty(),
      })

      const getOrCreateState = (
        sessionId: string
      ): Effect.Effect<CanvasSessionState> =>
        Effect.gen(function* () {
          const store = yield* Ref.get(stateRef)
          const existing = HashMap.get(store.sessions, sessionId)
          if (Option.isSome(existing)) {
            return existing.value
          }

          const initial: CanvasSessionState = {
            version: 1,
            blueprint: createDefaultCanvasBlueprint(),
            history: [],
          }

          yield* Ref.update(stateRef, (prev) => ({
            ...prev,
            sessions: HashMap.set(prev.sessions, sessionId, initial),
          }))

          return initial
        })

      const getSnapshot: CanvasStateServiceInterface["getSnapshot"] = (
        sessionId
      ) =>
        Effect.gen(function* () {
          const store = yield* Ref.get(stateRef)
          const existing = HashMap.get(store.sessions, sessionId)
          if (Option.isNone(existing)) {
            return Option.none()
          }
          return Option.some({
            version: existing.value.version,
            blueprint: cloneBlueprint(existing.value.blueprint),
          } satisfies CanvasSnapshot)
        })

      const ensureSession: CanvasStateServiceInterface["ensureSession"] = (
        sessionId
      ) =>
        Effect.gen(function* () {
          const state = yield* getOrCreateState(sessionId)
          return {
            version: state.version,
            blueprint: cloneBlueprint(state.blueprint),
          }
        })

      const applyOperation: CanvasStateServiceInterface["applyOperation"] = (
        sessionId,
        op
      ) =>
        Effect.gen(function* () {
          const state = yield* getOrCreateState(sessionId)
          const { nextState, changed } = applyOpToBlueprint(state, op)

          if (changed) {
            yield* Ref.update(stateRef, (prev) => ({
              ...prev,
              sessions: HashMap.set(prev.sessions, sessionId, nextState),
            }))
          }

          return {
            version: nextState.version,
            blueprint: cloneBlueprint(nextState.blueprint),
            changed,
          } satisfies CanvasApplyResult
        })

      const exportBlueprint: CanvasStateServiceInterface["exportBlueprint"] = (
        sessionId
      ) =>
        Effect.gen(function* () {
          const state = yield* getOrCreateState(sessionId)
          return cloneBlueprint(state.blueprint)
        })

      const clearSession: CanvasStateServiceInterface["clearSession"] = (
        sessionId
      ) =>
        Ref.update(stateRef, (prev) => ({
          ...prev,
          sessions: HashMap.remove(prev.sessions, sessionId),
        }))

      const pruneSessions: CanvasStateServiceInterface["pruneSessions"] = (
        activeSessionIds
      ) =>
        Effect.gen(function* () {
          const activeSet = new Set(activeSessionIds)
          let removed = 0

          yield* Ref.update(stateRef, (prev) => {
            let nextSessions = prev.sessions

            for (const [sessionId] of HashMap.entries(prev.sessions)) {
              if (!activeSet.has(sessionId)) {
                nextSessions = HashMap.remove(nextSessions, sessionId)
                removed++
              }
            }

            return {
              ...prev,
              sessions: nextSessions,
            }
          })

          return removed
        })

      return {
        getSnapshot,
        ensureSession,
        applyOperation,
        exportBlueprint,
        clearSession,
        pruneSessions,
      } satisfies CanvasStateServiceInterface
    }),
  }
) {}

export const CanvasStateServiceLive = CanvasStateService.Default
