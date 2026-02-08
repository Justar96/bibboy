import type * as Phaser from "phaser"
import type {
  CanvasCharacterBlueprint,
} from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"
import { PixelBoy } from "./PixelBoy"

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
    ...(blueprint.visibility ? { visibility: { ...blueprint.visibility } } : {}),
  }
}

/**
 * Chat avatar compatibility layer.
 *
 * Extends PixelBoy with blueprint management and canvas integration.
 */
export class SoulCharacter extends PixelBoy {
  private blueprint: CanvasCharacterBlueprint = createDefaultCanvasBlueprint()

  constructor(scene: Phaser.Scene, x: number, y: number, scale = 5) {
    super(scene, x, y, scale)
  }

  setBlueprint(blueprint: CanvasCharacterBlueprint): void {
    this.blueprint = cloneBlueprint(blueprint)
  }

  flash(): void {
    if (!this.scene?.sys) return

    this.scene.tweens.add({
      targets: this,
      alpha: 0.45,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
    })
  }
}
