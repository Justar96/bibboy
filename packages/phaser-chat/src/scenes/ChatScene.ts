import Phaser from "phaser"
import type { AgentPose, CharacterState } from "@bibboy/shared"
import { PixelBoy } from "../sprites/PixelBoy"
import { SpeechBubble } from "../ui/SpeechBubble"

const GROUND_Y_OFFSET = 40 // distance from bottom of canvas to ground line
const BOY_MARGIN = 80 // horizontal margin for wandering bounds
const SPRITE_PX = 16 // base sprite size in pixels

const MOBILE_HEIGHT_THRESHOLD = 240 // canvas height below which we use larger sprites
const SPRITE_SCALE_MOBILE = 6
const SPRITE_SCALE_DEFAULT = 5
const ENTRANCE_START_X = -30 // off-screen left, where boy walks in from
const BUBBLE_GAP = 12 // vertical gap between sprite top and bubble bottom
const LONG_RESPONSE_THRESHOLD = 5 // chunk count to trigger celebration
const CHUNK_LINGER_MS = 800 // how long last chunk stays visible before hiding

const GROUND_LINE_WIDTH = 1
const GROUND_LINE_COLOR = 0xe8e8e8
const GROUND_LINE_ALPHA = 0.6

export class ChatScene extends Phaser.Scene {
  private boy!: PixelBoy
  private bubble: SpeechBubble | null = null
  private groundLine!: Phaser.GameObjects.Graphics

  private spriteScale = 5
  private chunks: string[] = []
  private chunkIndex = 0
  private isShowingChunks = false
  private hasEntrance = false

  /** Computed sprite height based on current scale */
  private get spriteHeight(): number {
    return SPRITE_PX * this.spriteScale
  }

  constructor() {
    super("ChatScene")
  }

  create(): void {
    const { width, height } = this.scale

    // Background color
    this.cameras.main.setBackgroundColor("#FAFAFA")

    // Subtle ground line near the bottom
    this.groundLine = this.add.graphics()
    this.drawGroundLine(width, height)

    // Compute sprite scale: bigger on shorter (mobile) canvases
    this.spriteScale = height <= MOBILE_HEIGHT_THRESHOLD ? SPRITE_SCALE_MOBILE : SPRITE_SCALE_DEFAULT

    // Create the pixel boy at center, standing on the ground line
    const groundY = height - GROUND_Y_OFFSET
    this.boy = new PixelBoy(this, width / 2, groundY, this.spriteScale)
    this.boy.setBounds(BOY_MARGIN, width - BOY_MARGIN)

    // Entrance animation: walk in from left, stop center, wave
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
    const bubbleY = groundY - this.spriteHeight - BUBBLE_GAP

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
      const bubbleY = groundY - this.spriteHeight - BUBBLE_GAP
      this.bubble.updatePosition(this.boy.x, bubbleY)
    }
  }
}
