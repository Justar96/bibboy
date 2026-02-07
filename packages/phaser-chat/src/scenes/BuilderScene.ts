import * as Phaser from "phaser"
import type { CanvasCharacterBlueprint, CanvasOp } from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"
import { PixelBoy } from "../sprites/PixelBoy"
import { TargetCharacter } from "../sprites/TargetCharacter"

const GROUND_Y_OFFSET = 34
const GUIDE_X_RATIO = 0.28
const TARGET_X_RATIO = 0.72
const BOY_SCALE = 4

export class BuilderScene extends Phaser.Scene {
  private guideBoy: PixelBoy | null = null
  private targetCharacter: TargetCharacter | null = null
  private groundLine: Phaser.GameObjects.Graphics | null = null
  private versionLabel: Phaser.GameObjects.Text | null = null

  constructor() {
    super("BuilderScene")
  }

  create(): void {
    const { width, height } = this.scale
    const groundY = height - GROUND_Y_OFFSET

    this.cameras.main.setBackgroundColor("#FAFAFA")

    this.groundLine = this.add.graphics()
    this.drawGroundLine(width, groundY)

    this.guideBoy = new PixelBoy(this, Math.round(width * GUIDE_X_RATIO), groundY, BOY_SCALE)
    this.guideBoy.setBounds(40, Math.round(width * 0.45))
    this.guideBoy.setCharacterState("idle")

    this.targetCharacter = new TargetCharacter(
      this,
      Math.round(width * TARGET_X_RATIO),
      groundY
    )
    this.targetCharacter.setBlueprint(createDefaultCanvasBlueprint())

    this.add.text(Math.round(width * GUIDE_X_RATIO), groundY + 14, "guide", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#999999",
    }).setOrigin(0.5, 0)

    this.add.text(Math.round(width * TARGET_X_RATIO), groundY + 14, "builder output", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#999999",
    }).setOrigin(0.5, 0)

    this.versionLabel = this.add.text(width - 10, 10, "v-", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#999999",
    })
    this.versionLabel.setOrigin(1, 0)

    this.scale.on("resize", this.handleResize, this)
    this.events.on("shutdown", this.handleShutdown, this)
    this.events.on("destroy", this.handleShutdown, this)
  }

  handleCanvasSnapshot(blueprint: CanvasCharacterBlueprint, version: number): void {
    this.targetCharacter?.setBlueprint(blueprint)
    this.versionLabel?.setText(`v${version}`)
  }

  handleCanvasPatch(
    _op: CanvasOp | null,
    blueprint: CanvasCharacterBlueprint,
    version: number
  ): void {
    this.handleCanvasSnapshot(blueprint, version)
    this.targetCharacter?.flash()
    this.guideBoy?.bounce()
  }

  private drawGroundLine(width: number, y: number): void {
    if (!this.groundLine) return
    this.groundLine.clear()
    this.groundLine.lineStyle(1, 0xe1e1e1, 0.65)
    this.groundLine.beginPath()
    this.groundLine.moveTo(0, y)
    this.groundLine.lineTo(width, y)
    this.groundLine.strokePath()
  }

  private handleResize(size: Phaser.Structs.Size): void {
    const { width, height } = size
    const groundY = height - GROUND_Y_OFFSET

    this.drawGroundLine(width, groundY)
    if (this.guideBoy) {
      this.guideBoy.setPosition(Math.round(width * GUIDE_X_RATIO), groundY)
      this.guideBoy.setBounds(40, Math.round(width * 0.45))
    }
    if (this.targetCharacter) {
      this.targetCharacter.setPosition(Math.round(width * TARGET_X_RATIO), groundY)
    }
    this.versionLabel?.setPosition(width - 10, 10)
  }

  private handleShutdown(): void {
    this.scale.off("resize", this.handleResize, this)
    this.events.off("shutdown", this.handleShutdown, this)
    this.events.off("destroy", this.handleShutdown, this)
  }
}
