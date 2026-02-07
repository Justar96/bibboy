import { useCallback, useEffect, useRef } from "react"
import Phaser from "phaser"
import type { CanvasCharacterBlueprint, CanvasOp } from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"
import { BuilderScene } from "./scenes/BuilderScene"

interface PhaserBuilderCanvasProps {
  readonly blueprint: CanvasCharacterBlueprint | null
  readonly version: number | null
  readonly lastOp: CanvasOp | null
  readonly connectionState: "connecting" | "connected" | "disconnected" | "reconnecting"
}

export function PhaserBuilderCanvas({
  blueprint,
  version,
  lastOp,
  connectionState,
}: PhaserBuilderCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const lastAppliedVersionRef = useRef<number | null>(null)

  const getScene = useCallback((): BuilderScene | null => {
    const game = gameRef.current
    if (!game) return null
    const scene = game.scene.getScene("BuilderScene") as BuilderScene | undefined
    if (!scene?.sys) return null
    return scene
  }, [])

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: containerRef.current,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      pixelArt: true,
      transparent: true,
      banner: false,
      audio: { noAudio: true },
      // @ts-expect-error Phaser types require string but false disables physics.
      physics: { default: false },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
      },
      scene: [BuilderScene],
    })

    gameRef.current = game

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = getScene()
    if (!scene) return

    const nextBlueprint = blueprint ?? createDefaultCanvasBlueprint()
    const nextVersion = version ?? 1

    if (lastAppliedVersionRef.current === nextVersion) {
      return
    }

    scene.handleCanvasPatch(lastOp, nextBlueprint, nextVersion)
    lastAppliedVersionRef.current = nextVersion
  }, [blueprint, version, lastOp, getScene])

  return (
    <section className="mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[9px] text-[#CCCCCC] uppercase tracking-[0.2em]">
          Realtime Sprite Builder
        </span>
        <span className="font-mono text-[10px] text-[#999999]">
          {connectionState === "connected" ? "live" : connectionState}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative mx-auto w-full h-[220px] sm:h-[250px] lg:h-[280px] border border-[#E8E8E8] rounded-md bg-[#FAFAFA]"
      />
    </section>
  )
}
