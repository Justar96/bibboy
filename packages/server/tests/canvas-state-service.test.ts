import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import type { CanvasOp } from "@bibboy/shared"
import { CanvasStateService, CanvasStateServiceLive } from "../src/services/CanvasStateService"

const runWithCanvasService = <A>(
  effect: Effect.Effect<A, never, CanvasStateService>
): Promise<A> => Effect.runPromise(effect.pipe(Effect.provide(CanvasStateServiceLive)))

describe("CanvasStateService", () => {
  it("creates default state per session", async () => {
    const snapshot = await runWithCanvasService(
      Effect.gen(function* () {
        const service = yield* CanvasStateService
        return yield* service.ensureSession("session-a")
      })
    )

    expect(snapshot.version).toBe(1)
    expect(snapshot.blueprint.entityId).toBe("character_main")
    expect(snapshot.blueprint.layers.hair.variant).toBe("short")
  })

  it("applies operations and increments version", async () => {
    const result = await runWithCanvasService(
      Effect.gen(function* () {
        const service = yield* CanvasStateService
        const op: CanvasOp = {
          type: "set_layer_variant",
          layer: "hair",
          variant: "spiky",
        }
        return yield* service.applyOperation("session-b", op)
      })
    )

    expect(result.changed).toBe(true)
    expect(result.version).toBe(2)
    expect(result.blueprint.layers.hair.variant).toBe("spiky")
  })

  it("undoes the latest mutation", async () => {
    const state = await runWithCanvasService(
      Effect.gen(function* () {
        const service = yield* CanvasStateService
        const applyOp: CanvasOp = {
          type: "set_layer_variant",
          layer: "hair",
          variant: "messy",
        }
        yield* service.applyOperation("session-c", applyOp)
        const undoOp: CanvasOp = { type: "undo" }
        return yield* service.applyOperation("session-c", undoOp)
      })
    )

    expect(state.version).toBe(3)
    expect(state.blueprint.layers.hair.variant).toBe("short")
  })

  it("prunes canvas states for expired sessions", async () => {
    const removed = await runWithCanvasService(
      Effect.gen(function* () {
        const service = yield* CanvasStateService
        yield* service.ensureSession("s1")
        yield* service.ensureSession("s2")
        return yield* service.pruneSessions(["s2"])
      })
    )

    expect(removed).toBe(1)
  })
})
