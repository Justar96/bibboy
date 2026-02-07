import * as Phaser from "phaser"
import type { CanvasAnimationId, CanvasCharacterBlueprint, CanvasPoseId } from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"

const CELL = 6

export class TargetCharacter extends Phaser.GameObjects.Container {
  private readonly graphics: Phaser.GameObjects.Graphics
  private blueprint: CanvasCharacterBlueprint = createDefaultCanvasBlueprint()
  private animTween: Phaser.Tweens.Tween | null = null

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this.graphics = scene.add.graphics()
    this.add(this.graphics)
    scene.add.existing(this)
    this.redraw()
    this.applyAnimation(this.blueprint.animation)
  }

  setBlueprint(blueprint: CanvasCharacterBlueprint): void {
    this.blueprint = {
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
    this.redraw()
    this.applyAnimation(this.blueprint.animation)
  }

  flash(): void {
    this.scene.tweens.add({
      targets: this.graphics,
      alpha: 0.5,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut",
    })
  }

  destroy(fromScene?: boolean): void {
    if (this.animTween) {
      this.animTween.stop()
      this.animTween = null
    }
    super.destroy(fromScene)
  }

  private redraw(): void {
    this.graphics.clear()

    const skin = this.blueprint.layers.body.color
    const hair = this.blueprint.layers.hair.color
    const eye = this.blueprint.layers.eyes.color
    const outfit = this.blueprint.layers.outfit.color
    const accessory = this.blueprint.layers.accessory.color
    const outline = 0x1a1a1a
    const vis = this.blueprint.visibility

    const baseLegHeight = this.blueprint.pose === "sit" ? 2 : 4
    const bodyWidth = this.blueprint.layers.body.variant === "slim" ? 3 : 4
    const bodyLeft = -Math.floor((bodyWidth * CELL) / 2)

    const feetY = 0
    const legsTop = feetY - baseLegHeight * CELL
    const torsoTop = legsTop - 5 * CELL
    const headTop = torsoTop - 4 * CELL

    // Outfit layer: Legs, Torso, Arms
    if (vis?.outfit !== false) {
      this.fillRect(bodyLeft, legsTop, CELL, baseLegHeight * CELL, outfit)
      this.fillRect(bodyLeft + (bodyWidth - 1) * CELL, legsTop, CELL, baseLegHeight * CELL, outfit)
      this.fillRect(bodyLeft, torsoTop, bodyWidth * CELL, 5 * CELL, outfit)
      this.drawArms(bodyLeft, torsoTop, bodyWidth, outfit, this.blueprint.pose)
    }

    // Body layer: Head
    if (vis?.body !== false) {
      this.fillRect(bodyLeft, headTop, bodyWidth * CELL, 4 * CELL, skin)
    }

    // Hair layer
    if (vis?.hair !== false) {
      this.drawHair(bodyLeft, headTop, bodyWidth, hair)
    }

    // Eyes layer
    if (vis?.eyes !== false) {
      this.drawEyes(bodyLeft, headTop, bodyWidth, eye)
    }

    // Accessory layer
    if (vis?.accessory !== false) {
      this.drawAccessory(bodyLeft, headTop, bodyWidth, accessory)
    }

    // Outline frame
    this.graphics.lineStyle(1, outline, 0.45)
    this.graphics.strokeRect(bodyLeft - 2, headTop - 2, bodyWidth * CELL + 4, (feetY - headTop) + 2)
  }

  private drawArms(
    bodyLeft: number,
    torsoTop: number,
    bodyWidth: number,
    color: string,
    pose: CanvasPoseId
  ): void {
    const leftArmX = bodyLeft - CELL
    const rightArmX = bodyLeft + bodyWidth * CELL
    const armY = torsoTop + CELL

    if (pose === "wave") {
      this.fillRect(leftArmX, armY - 3 * CELL, CELL, 3 * CELL, color)
      this.fillRect(rightArmX, armY, CELL, 3 * CELL, color)
      return
    }

    if (pose === "celebrate") {
      this.fillRect(leftArmX, armY - 3 * CELL, CELL, 3 * CELL, color)
      this.fillRect(rightArmX, armY - 3 * CELL, CELL, 3 * CELL, color)
      return
    }

    if (pose === "sit") {
      this.fillRect(leftArmX, armY + CELL, CELL, 2 * CELL, color)
      this.fillRect(rightArmX, armY + CELL, CELL, 2 * CELL, color)
      return
    }

    this.fillRect(leftArmX, armY, CELL, 3 * CELL, color)
    this.fillRect(rightArmX, armY, CELL, 3 * CELL, color)
  }

  private drawHair(
    bodyLeft: number,
    headTop: number,
    bodyWidth: number,
    color: string
  ): void {
    if (this.blueprint.layers.hair.variant === "spiky") {
      this.fillRect(bodyLeft, headTop - CELL, bodyWidth * CELL, CELL, color)
      this.fillRect(bodyLeft + CELL, headTop - 2 * CELL, CELL, CELL, color)
      this.fillRect(bodyLeft + 3 * CELL, headTop - 2 * CELL, CELL, CELL, color)
      return
    }

    if (this.blueprint.layers.hair.variant === "bob") {
      this.fillRect(bodyLeft - CELL, headTop, (bodyWidth + 2) * CELL, CELL, color)
      this.fillRect(bodyLeft - CELL, headTop + CELL, CELL, 2 * CELL, color)
      this.fillRect(bodyLeft + bodyWidth * CELL, headTop + CELL, CELL, 2 * CELL, color)
      return
    }

    if (this.blueprint.layers.hair.variant === "messy") {
      this.fillRect(bodyLeft, headTop - CELL, bodyWidth * CELL, CELL, color)
      this.fillRect(bodyLeft + CELL, headTop, (bodyWidth - 1) * CELL, CELL, color)
      this.fillRect(bodyLeft - CELL, headTop + CELL, CELL, CELL, color)
      return
    }

    // short
    this.fillRect(bodyLeft, headTop - CELL, bodyWidth * CELL, CELL, color)
  }

  private drawEyes(
    bodyLeft: number,
    headTop: number,
    bodyWidth: number,
    color: string
  ): void {
    const leftEyeX = bodyLeft + CELL
    const rightEyeX = bodyLeft + (bodyWidth - 2) * CELL
    const eyeY = headTop + 2 * CELL

    if (this.blueprint.layers.eyes.variant === "closed") {
      this.fillRect(leftEyeX, eyeY, CELL, 1, color)
      this.fillRect(rightEyeX, eyeY, CELL, 1, color)
      return
    }

    if (this.blueprint.layers.eyes.variant === "happy") {
      this.fillRect(leftEyeX, eyeY - 1, CELL, 2, color)
      this.fillRect(rightEyeX, eyeY - 1, CELL, 2, color)
      return
    }

    this.fillRect(leftEyeX, eyeY, CELL, CELL, color)
    this.fillRect(rightEyeX, eyeY, CELL, CELL, color)
  }

  private drawAccessory(
    bodyLeft: number,
    headTop: number,
    bodyWidth: number,
    color: string
  ): void {
    if (this.blueprint.layers.accessory.variant === "none") {
      return
    }

    if (this.blueprint.layers.accessory.variant === "glasses") {
      const glassesY = headTop + 2 * CELL
      this.fillRect(bodyLeft + CELL, glassesY, CELL, CELL, color)
      this.fillRect(bodyLeft + (bodyWidth - 2) * CELL, glassesY, CELL, CELL, color)
      this.fillRect(bodyLeft + 2 * CELL, glassesY, CELL, 1, color)
      return
    }

    // cap
    this.fillRect(bodyLeft, headTop - 2 * CELL, bodyWidth * CELL, CELL, color)
    this.fillRect(bodyLeft + CELL, headTop - CELL, (bodyWidth - 1) * CELL, CELL, color)
  }

  private applyAnimation(animation: CanvasAnimationId): void {
    if (this.animTween) {
      this.animTween.stop()
      this.animTween = null
    }

    this.setAngle(0)
    this.setScale(1)
    this.y = Math.round(this.y)

    switch (animation) {
      case "idle":
        this.animTween = this.scene.tweens.add({
          targets: this,
          y: this.y - 3,
          duration: 1300,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
        break
      case "talk":
        this.animTween = this.scene.tweens.add({
          targets: this,
          scaleY: 1.05,
          duration: 160,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
        break
      case "walk":
        this.animTween = this.scene.tweens.add({
          targets: this,
          x: this.x + 12,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
        break
      case "dance":
        this.animTween = this.scene.tweens.add({
          targets: this,
          angle: 8,
          y: this.y - 5,
          duration: 220,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
        break
      case "celebrate":
        this.animTween = this.scene.tweens.add({
          targets: this,
          y: this.y - 12,
          duration: 260,
          yoyo: true,
          repeat: -1,
          ease: "Quad.easeOut",
        })
        break
      default: {
        const neverAnimation: never = animation
        throw new Error(`Unhandled animation: ${neverAnimation}`)
      }
    }
  }

  private fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ): void {
    this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1)
    this.graphics.fillRect(x, y, width, height)
  }
}
