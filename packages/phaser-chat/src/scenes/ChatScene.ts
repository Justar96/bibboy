import * as Phaser from "phaser"
import type { AgentPose, CanvasCharacterBlueprint, CanvasOp, CharacterState, SoulState, SoulStage } from "@bibboy/shared"
import { SoulCharacter } from "../sprites/SoulCharacter"
import { SpeechBubble } from "../ui/SpeechBubble"

const GROUND_Y_OFFSET = 40
const BOY_MARGIN = 80
const SPRITE_HEIGHT = 16 * 3 / 2 + 12 // half sprite height (scaled) + aura + margin

const ENTRANCE_START_X = -30
const BUBBLE_GAP = 12
const LONG_RESPONSE_THRESHOLD = 5
const CHUNK_LINGER_MS = 800

const GROUND_LINE_WIDTH = 1
const GROUND_LINE_COLOR = 0xe8e8e8
const GROUND_LINE_ALPHA = 0.6

export class ChatScene extends Phaser.Scene {
  private boy!: SoulCharacter
  private bubble: SpeechBubble | null = null
  private groundLine!: Phaser.GameObjects.Graphics

  private chunks: string[] = []
  private chunkIndex = 0
  private isShowingChunks = false
  private hasEntrance = false

  constructor() {
    super("ChatScene")
  }

  create(): void {
    const { width, height } = this.scale

    this.cameras.main.setBackgroundColor("#FAFAFA")

    this.groundLine = this.add.graphics()
    this.drawGroundLine(width, height)

    const groundY = height - GROUND_Y_OFFSET
    this.boy = new SoulCharacter(this, width / 2, groundY)
    this.boy.setBounds(BOY_MARGIN, width - BOY_MARGIN)

    // Entrance animation
    this.boy.setPosition(ENTRANCE_START_X, groundY)
    this.boy.walkTo(width / 2, () => {
      this.hasEntrance = true
      this.boy.setCharacterState("idle")
    })

    // Handle canvas resize
    this.scale.on("resize", this.handleResize, this)

    // Clean up resize listener when this scene shuts down
    this.events.on("shutdown", this.handleShutdown, this)
    this.events.on("destroy", this.handleShutdown, this)
  }

  private handleShutdown(): void {
    this.scale.off("resize", this.handleResize, this)
    this.events.off("shutdown", this.handleShutdown, this)
    this.events.off("destroy", this.handleShutdown, this)
  }

  // -------------------------------------------------------------------------
  // Public API — called directly from React (no EventBus)
  // -------------------------------------------------------------------------

  /** User sent a message — boy stops and thinks. */
  handleUserSent(): void {
    if (!this.boy || !this.hasEntrance) return
    this.dismissBubble()
    this.boy.setCharacterState("thinking")
  }

  /** Get the current character state. */
  getCharacterState(): CharacterState {
    if (!this.boy) return "idle"
    return this.boy.getCharacterState()
  }

  /** Agent requested a pose change — set it directly. */
  handlePoseChange(pose: AgentPose): void {
    if (!this.boy || !this.hasEntrance) return
    this.dismissBubble()
    this.boy.setCharacterState(pose)
  }

  /** Context compaction started — boy squishes paper and throws it. */
  handleCompacting(): void {
    if (!this.boy || !this.hasEntrance) return
    this.dismissBubble()
    this.boy.setCharacterState("compacting")
  }

  /** Apply a canvas blueprint update (from WebSocket patch/snapshot). */
  handleCanvasPatch(_op: CanvasOp | null, blueprint: CanvasCharacterBlueprint, _version: number): void {
    if (!this.boy) return
    this.boy.setBlueprint(blueprint)
    this.boy.flash()
  }

  /** Update soul state (from WebSocket snapshot). */
  handleSoulStateUpdate(state: SoulState): void {
    if (!this.boy) return
    this.boy.setSoulState(state)
  }

  /** Update soul stage (from WebSocket stage_change). */
  handleSoulStageChange(stage: SoulStage): void {
    if (!this.boy) return
    this.boy.setSoulStage(stage)
  }

  /** Response arrived as chunks — start showing them. */
  handleResponseChunks(chunks: string[]): void {
    if (!this.boy || chunks.length === 0) return
    this.chunks = chunks
    this.chunkIndex = 0
    this.isShowingChunks = true

    this.boy.setCharacterState("talking")
    this.showCurrentChunk()
  }

  /** Advance to the next chunk (Enter / Space / click). */
  handleAdvanceChunk(): void {
    if (!this.isShowingChunks) return

    // If typewriter is still running, skip to full text first
    if (this.bubble && !this.bubble.isTypewriterDone()) {
      this.bubble.skipTypewriter()
      return
    }

    // Move to next chunk
    this.chunkIndex++
    if (this.chunkIndex < this.chunks.length) {
      this.showCurrentChunk()
      this.boy.bounce()
    } else {
      // All chunks shown — dismiss and return to idle
      this.finishChunks()
    }
  }

  private showCurrentChunk(): void {
    const text = this.chunks[this.chunkIndex]
    const hasMore = this.chunkIndex < this.chunks.length - 1

    const { height } = this.scale
    const groundY = height - GROUND_Y_OFFSET
    const bubbleX = this.boy.x
    const bubbleY = groundY - SPRITE_HEIGHT - BUBBLE_GAP

    if (this.bubble) {
      // Update position to follow boy, then show chunk
      this.bubble.updatePosition(bubbleX, bubbleY)
      this.bubble.showChunk(text, hasMore)
    } else {
      // Create new bubble at boy's position
      this.bubble = new SpeechBubble(this, bubbleX, bubbleY)
      this.bubble.showChunk(text, hasMore)
    }
  }

  private finishChunks(): void {
    const wasLongResponse = this.chunks.length >= LONG_RESPONSE_THRESHOLD
    this.isShowingChunks = false
    this.chunks = []
    this.chunkIndex = 0

    // Let the last chunk linger before fading out
    const nextState = wasLongResponse ? "celebrating" : "idle"
    if (this.bubble) {
      this.time.delayedCall(CHUNK_LINGER_MS, () => {
        if (this.bubble) {
          this.bubble.hide(() => {
            this.bubble = null
          })
        }
        this.boy.setCharacterState(nextState)
      })
    } else {
      this.boy.setCharacterState(nextState)
    }
  }

  private dismissBubble(): void {
    if (this.bubble) {
      this.bubble.hide()
      this.bubble = null
    }
    this.isShowingChunks = false
    this.chunks = []
    this.chunkIndex = 0
  }

  private drawGroundLine(width: number, height: number): void {
    this.groundLine.clear()
    this.groundLine.lineStyle(GROUND_LINE_WIDTH, GROUND_LINE_COLOR, GROUND_LINE_ALPHA)
    const y = height - GROUND_Y_OFFSET
    this.groundLine.beginPath()
    this.groundLine.moveTo(0, y)
    this.groundLine.lineTo(width, y)
    this.groundLine.strokePath()
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize
    const groundY = height - GROUND_Y_OFFSET

    // Redraw ground line
    this.drawGroundLine(width, height)

    // Update boy bounds and position
    this.boy.setBounds(BOY_MARGIN, width - BOY_MARGIN)
    this.boy.y = groundY

    // Update bubble position if visible
    if (this.bubble) {
      const bubbleY = groundY - SPRITE_HEIGHT - BUBBLE_GAP
      this.bubble.updatePosition(this.boy.x, bubbleY)
    }
  }
}
