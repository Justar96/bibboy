import * as Phaser from "phaser"
import type {
  CanvasCharacterBlueprint,
  CharacterState,
  SoulState,
  SoulStage,
} from "@bibboy/shared"
import { createDefaultCanvasBlueprint } from "@bibboy/shared"

// ---------------------------------------------------------------------------
// Orb sizing & color palette
// ---------------------------------------------------------------------------

/** Pixel size of one cell in the orb grid. */
const C = 4

/** Body radius in cells. */
const BODY_R = 5

/** Colors matching the reference image. */
const BODY_COLOR = 0x3a3f5c
const BODY_HIGHLIGHT = 0x4a5070
const EYE_WHITE = 0xffffff
const PUPIL_COLOR = 0x1a1a2e
const AURA_CYAN = 0x7fdfef
const AURA_CYAN_ALPHA = 0.35
const FLAME_ORANGE = 0xf0854a
const FLAME_RED = 0xe05544
const PARTICLE_CYAN = 0x80e8ff
const PARTICLE_ORANGE = 0xf09050

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const FLOAT_PX = 4
const FLOAT_DURATION_MS = 1600

const BOUNCE_OFFSET = 6
const BOUNCE_DURATION_MS = 120

const WALK_SPEED_PX_PER_S = 70
const WALK_MIN_DURATION_MS = 200

const SWAY_THINKING_PX = 2
const SWAY_THINKING_DURATION_MS = 1200

const BLINK_MIN_MS = 2800
const BLINK_MAX_MS = 5000
const BLINK_DURATION_MS = 130

const LOOK_AROUND_MIN_MS = 7000
const LOOK_AROUND_MAX_MS = 14000
const LOOK_GLANCE_MS = 350

const ACTIVITY_MIN_DELAY_MS = 8000
const ACTIVITY_MAX_DELAY_MS = 16000

const CELEBRATE_JUMP_PX = 18
const CELEBRATE_JUMP_DURATION_MS = 320
const CELEBRATE_COOLDOWN_MS = 500

const TALK_SQUISH_DURATION_MS = 200

const THINKING_DOT_COLOR = 0x80e8ff
const THINKING_DOT_RADIUS = 3
const THINKING_DOT_SPACING = 10
const THINKING_DOT_COUNT = 3
const THINKING_DOT_INTERVAL_MS = 400

const DANCE_SWAY_PX = 4
const DANCE_SWAY_DURATION_MS = 350
const DANCE_BOUNCE_PX = 5
const DANCE_BOUNCE_DURATION_MS = 200
const DANCE_MIN_MS = 4000
const DANCE_MAX_MS = 9000

const MEDITATE_MIN_MS = 10000
const MEDITATE_MAX_MS = 18000

const SLEEP_ZZZ_FONT_SIZE = "9px"
const SLEEP_ZZZ_FLOAT_PX = 16
const SLEEP_ZZZ_FLOAT_DURATION_MS = 1500
const SLEEP_ZZZ_PAUSE_MS = 600
const SITTING_SLEEP_DELAY_MS = 20000

const COMPACT_HOLD_MS = 500
const COMPACT_SQUISH_MS = 400

// Flame tail particles
const FLAME_PARTICLE_COUNT = 14
const FLAME_PARTICLE_MIN_SIZE = 2
const FLAME_PARTICLE_MAX_SIZE = 5
const FLAME_SPAWN_RADIUS = 12
const FLAME_RISE_MIN = 20
const FLAME_RISE_MAX = 50
const FLAME_LIFE_MIN_MS = 400
const FLAME_LIFE_MAX_MS = 900
const FLAME_SPAWN_INTERVAL_MS = 60

// Small floating particles around the orb
const AMBIENT_PARTICLE_COUNT = 6
const AMBIENT_RADIUS = 30
const AMBIENT_SIZE = 2
const AMBIENT_LIFE_MIN_MS = 800
const AMBIENT_LIFE_MAX_MS = 1600
const AMBIENT_SPAWN_INTERVAL_MS = 250

// ---------------------------------------------------------------------------
// Eye state
// ---------------------------------------------------------------------------

type EyeExpression = "open" | "happy" | "closed" | "wide"

// ---------------------------------------------------------------------------
// SoulCharacter — flame orb sprite with physics-like tail
// ---------------------------------------------------------------------------

export class SoulCharacter extends Phaser.GameObjects.Container {
  private readonly orbBody: Phaser.GameObjects.Graphics
  private readonly aura: Phaser.GameObjects.Graphics
  private readonly eyeGfx: Phaser.GameObjects.Graphics
  private readonly thinkingDots: readonly Phaser.GameObjects.Arc[]

  private blueprint: CanvasCharacterBlueprint = createDefaultCanvasBlueprint()
  private currentState: CharacterState = "idle"
  private soulStage: SoulStage = "orb"
  private isDestroyed = false
  private eyeExpression: EyeExpression = "open"
  private lookOffsetX = 0 // pupil offset for look-around

  private minX = 0
  private maxX = 800

  // Tweens
  private floatTween: Phaser.Tweens.Tween | null = null
  private swayTween: Phaser.Tweens.Tween | null = null
  private walkTween: Phaser.Tweens.Tween | null = null
  private bounceTween: Phaser.Tweens.Tween | null = null
  private jumpTween: Phaser.Tweens.Tween | null = null
  private squishTween: Phaser.Tweens.Tween | null = null

  // Timers
  private blinkTimer: Phaser.Time.TimerEvent | null = null
  private lookTimer: Phaser.Time.TimerEvent | null = null
  private activityTimer: Phaser.Time.TimerEvent | null = null
  private sleepTimer: Phaser.Time.TimerEvent | null = null
  private dotsTimer: Phaser.Time.TimerEvent | null = null
  private talkTimer: Phaser.Time.TimerEvent | null = null
  private flameTimer: Phaser.Time.TimerEvent | null = null
  private ambientTimer: Phaser.Time.TimerEvent | null = null
  private readonly pendingDelays: Phaser.Time.TimerEvent[] = []

  // Sleep decoration
  private zzzText: Phaser.GameObjects.Text | null = null
  private zzzTween: Phaser.Tweens.Tween | null = null

  // Flame particles (managed manually for pixel-art feel)
  private readonly flameParticles: FlameParticle[] = []
  private readonly ambientParticles: FlameParticle[] = []

  private activityCount = 0
  private flameIntensity = 1.0 // multiplier for particle rate & size

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)

    // Aura glow layer (behind body)
    this.aura = scene.add.graphics()
    this.add(this.aura)

    // Main body
    this.orbBody = scene.add.graphics()
    this.add(this.orbBody)

    // Eyes
    this.eyeGfx = scene.add.graphics()
    this.add(this.eyeGfx)

    // Thinking dots
    const dotY = -(BODY_R * C) - 16
    const dots: Phaser.GameObjects.Arc[] = []
    for (let i = 0; i < THINKING_DOT_COUNT; i++) {
      const dot = scene.add.circle(
        -THINKING_DOT_SPACING + i * THINKING_DOT_SPACING,
        dotY,
        THINKING_DOT_RADIUS,
        THINKING_DOT_COLOR,
      )
      dot.setAlpha(0)
      dots.push(dot)
      this.add(dot)
    }
    this.thinkingDots = dots

    scene.add.existing(this)
    this.drawOrb()
    this.startFlameParticles()
    this.startAmbientParticles()
    this.enterIdle()
  }

  // -----------------------------------------------------------------------
  // Public API (PixelBoy-compatible)
  // -----------------------------------------------------------------------

  private get alive(): boolean {
    return !this.isDestroyed && this.scene?.sys != null
  }

  setCharacterState(state: CharacterState): void {
    if (!this.alive) return
    if (this.currentState === state) return
    if (state === "thinking" || state === "talking") this.activityCount = 0

    this.exitCurrentState()
    this.currentState = state

    switch (state) {
      case "idle": this.enterIdle(); break
      case "walking": this.enterWalking(this.x); break
      case "thinking": this.enterThinking(); break
      case "talking": this.enterTalking(); break
      case "celebrating": this.enterCelebrating(); break
      case "dancing": this.enterDancing(); break
      case "meditating": this.enterMeditating(); break
      case "sleeping": this.enterSleeping(); break
      case "sitting": this.enterSitting(); break
      case "compacting": this.enterCompacting(); break
      case "stretching": this.enterStretching(); break
      case "exercising": this.enterExercising(); break
      // Unsupported activity states → idle
      default: this.enterIdle(); break
    }
  }

  getCharacterState(): CharacterState { return this.currentState }

  walkTo(targetX: number, onComplete?: () => void): void {
    if (!this.alive) return
    this.exitCurrentState()
    this.currentState = "walking"
    this.enterWalking(targetX, onComplete)
  }

  bounce(): void {
    if (!this.alive) return
    if (this.bounceTween) { this.bounceTween.stop(); this.bounceTween = null }
    const baseY = this.y
    this.bounceTween = this.scene.tweens.add({
      targets: this, y: baseY - BOUNCE_OFFSET,
      duration: BOUNCE_DURATION_MS, ease: "Quad.easeOut", yoyo: true,
    })
  }

  setBounds(minX: number, maxX: number): void {
    this.minX = minX
    this.maxX = maxX
  }

  setBlueprint(blueprint: CanvasCharacterBlueprint): void {
    this.blueprint = { ...blueprint, layers: {
      body: { ...blueprint.layers.body },
      hair: { ...blueprint.layers.hair },
      eyes: { ...blueprint.layers.eyes },
      outfit: { ...blueprint.layers.outfit },
      accessory: { ...blueprint.layers.accessory },
    }}
    this.drawOrb()
  }

  setSoulState(state: SoulState): void { this.soulStage = state.stage }
  setSoulStage(stage: SoulStage): void {
    const prev = this.soulStage
    this.soulStage = stage
    if (prev !== stage) {
      // Flash + intensity burst on evolution
      this.flameIntensity = 2.0
      this.scene.tweens.add({
        targets: this.aura, alpha: 1, duration: 200, yoyo: true,
        onComplete: () => { this.flameIntensity = 1.0 },
      })
    }
  }

  flash(): void {
    this.scene.tweens.add({
      targets: this.orbBody, alpha: 0.4, duration: 80, yoyo: true, ease: "Quad.easeOut",
    })
  }

  destroy(fromScene?: boolean): void {
    this.isDestroyed = true
    this.exitCurrentState()
    this.stopFlameParticles()
    this.stopAmbientParticles()
    super.destroy(fromScene)
  }

  // -----------------------------------------------------------------------
  // Orb drawing
  // -----------------------------------------------------------------------

  private drawOrb(): void {
    this.drawAura()
    this.drawBody()
    this.drawEyes()
  }

  private drawAura(): void {
    this.aura.clear()
    const r = BODY_R * C + 6
    this.aura.fillStyle(AURA_CYAN, AURA_CYAN_ALPHA)
    this.aura.fillCircle(0, 0, r)
  }

  private drawBody(): void {
    this.orbBody.clear()
    const r = BODY_R * C

    // Main dark body circle
    this.orbBody.fillStyle(BODY_COLOR, 1)
    this.orbBody.fillCircle(0, 0, r)

    // Highlight — small lighter arc top-left
    this.orbBody.fillStyle(BODY_HIGHLIGHT, 0.6)
    this.orbBody.fillCircle(-r * 0.3, -r * 0.3, r * 0.4)
  }

  private drawEyes(): void {
    this.eyeGfx.clear()
    const r = BODY_R * C
    const eyeY = -1
    const eyeSpacing = r * 0.45
    const leftX = -eyeSpacing + this.lookOffsetX
    const rightX = eyeSpacing + this.lookOffsetX

    switch (this.eyeExpression) {
      case "open": {
        // White sclera
        this.eyeGfx.fillStyle(EYE_WHITE, 1)
        this.eyeGfx.fillCircle(leftX, eyeY, 4)
        this.eyeGfx.fillCircle(rightX, eyeY, 4)
        // Dark pupil
        this.eyeGfx.fillStyle(PUPIL_COLOR, 1)
        this.eyeGfx.fillCircle(leftX + 1, eyeY, 2)
        this.eyeGfx.fillCircle(rightX + 1, eyeY, 2)
        break
      }
      case "wide": {
        // Bigger eyes — excited / curious
        this.eyeGfx.fillStyle(EYE_WHITE, 1)
        this.eyeGfx.fillCircle(leftX, eyeY, 5)
        this.eyeGfx.fillCircle(rightX, eyeY, 5)
        this.eyeGfx.fillStyle(PUPIL_COLOR, 1)
        this.eyeGfx.fillCircle(leftX + 1, eyeY, 2.5)
        this.eyeGfx.fillCircle(rightX + 1, eyeY, 2.5)
        // Tiny highlight
        this.eyeGfx.fillStyle(EYE_WHITE, 0.8)
        this.eyeGfx.fillCircle(leftX - 1, eyeY - 1.5, 1)
        this.eyeGfx.fillCircle(rightX - 1, eyeY - 1.5, 1)
        break
      }
      case "happy": {
        // Curved happy eyes (small arcs)
        this.eyeGfx.lineStyle(2, PUPIL_COLOR, 1)
        this.eyeGfx.beginPath()
        this.eyeGfx.arc(leftX, eyeY + 1, 3, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340))
        this.eyeGfx.strokePath()
        this.eyeGfx.beginPath()
        this.eyeGfx.arc(rightX, eyeY + 1, 3, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340))
        this.eyeGfx.strokePath()
        break
      }
      case "closed": {
        // Horizontal lines
        this.eyeGfx.lineStyle(2, PUPIL_COLOR, 1)
        this.eyeGfx.beginPath()
        this.eyeGfx.moveTo(leftX - 3, eyeY)
        this.eyeGfx.lineTo(leftX + 3, eyeY)
        this.eyeGfx.strokePath()
        this.eyeGfx.beginPath()
        this.eyeGfx.moveTo(rightX - 3, eyeY)
        this.eyeGfx.lineTo(rightX + 3, eyeY)
        this.eyeGfx.strokePath()
        break
      }
    }
  }

  private setEyes(expr: EyeExpression): void {
    if (this.eyeExpression === expr) return
    this.eyeExpression = expr
    this.drawEyes()
  }

  // -----------------------------------------------------------------------
  // Flame tail particles (physics-like, rising & fading)
  // -----------------------------------------------------------------------

  private startFlameParticles(): void {
    this.flameTimer = this.scene.time.addEvent({
      delay: FLAME_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return
        // Spawn count scales with intensity
        const count = Math.ceil(this.flameIntensity * 2)
        for (let i = 0; i < count; i++) this.spawnFlameParticle()
      },
    })
  }

  private stopFlameParticles(): void {
    if (this.flameTimer) { this.flameTimer.destroy(); this.flameTimer = null }
    for (const p of this.flameParticles) { if (p.tween) p.tween.stop(); p.gfx.destroy() }
    this.flameParticles.length = 0
  }

  private spawnFlameParticle(): void {
    if (this.flameParticles.length >= FLAME_PARTICLE_COUNT * this.flameIntensity) return

    const angle = Phaser.Math.FloatBetween(-0.8, 0.8)
    const spawnR = Phaser.Math.FloatBetween(4, FLAME_SPAWN_RADIUS)
    const sx = Math.sin(angle) * spawnR
    const sy = Math.cos(angle) * spawnR * 0.5 + (BODY_R * C * 0.3) // spawn near bottom-center

    const size = Phaser.Math.FloatBetween(
      FLAME_PARTICLE_MIN_SIZE * this.flameIntensity,
      FLAME_PARTICLE_MAX_SIZE * this.flameIntensity
    )
    const life = Phaser.Math.Between(FLAME_LIFE_MIN_MS, FLAME_LIFE_MAX_MS)

    // Pick color: mostly cyan with some orange
    const isOrange = Math.random() < 0.35
    const color = isOrange
      ? (Math.random() < 0.5 ? FLAME_ORANGE : FLAME_RED)
      : PARTICLE_CYAN

    const gfx = this.scene.add.graphics()
    gfx.fillStyle(color, 0.8)
    gfx.fillRect(-size / 2, -size / 2, size, size) // pixel squares
    gfx.setPosition(sx, sy)
    this.add(gfx)
    this.moveBelow(gfx, this.aura)

    const riseY = sy - Phaser.Math.FloatBetween(FLAME_RISE_MIN, FLAME_RISE_MAX) * this.flameIntensity
    const driftX = sx + Phaser.Math.FloatBetween(-8, 8)

    const particle: FlameParticle = { gfx, tween: null }
    particle.tween = this.scene.tweens.add({
      targets: gfx,
      x: driftX,
      y: riseY,
      alpha: 0,
      duration: life,
      ease: "Quad.easeOut",
      onComplete: () => {
        const idx = this.flameParticles.indexOf(particle)
        if (idx !== -1) this.flameParticles.splice(idx, 1)
        gfx.destroy()
      },
    })
    this.flameParticles.push(particle)
  }

  // Small ambient floating particles
  private startAmbientParticles(): void {
    this.ambientTimer = this.scene.time.addEvent({
      delay: AMBIENT_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return
        this.spawnAmbientParticle()
      },
    })
  }

  private stopAmbientParticles(): void {
    if (this.ambientTimer) { this.ambientTimer.destroy(); this.ambientTimer = null }
    for (const p of this.ambientParticles) { if (p.tween) p.tween.stop(); p.gfx.destroy() }
    this.ambientParticles.length = 0
  }

  private spawnAmbientParticle(): void {
    if (this.ambientParticles.length >= AMBIENT_PARTICLE_COUNT) return

    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2)
    const dist = Phaser.Math.FloatBetween(BODY_R * C, AMBIENT_RADIUS)
    const sx = Math.cos(ang) * dist
    const sy = Math.sin(ang) * dist

    const color = Math.random() < 0.7 ? PARTICLE_CYAN : PARTICLE_ORANGE
    const life = Phaser.Math.Between(AMBIENT_LIFE_MIN_MS, AMBIENT_LIFE_MAX_MS)

    const gfx = this.scene.add.graphics()
    gfx.fillStyle(color, 0.6)
    gfx.fillRect(0, 0, AMBIENT_SIZE, AMBIENT_SIZE)
    gfx.setPosition(sx, sy)
    this.add(gfx)
    this.moveBelow(gfx, this.aura)

    const particle: FlameParticle = { gfx, tween: null }
    particle.tween = this.scene.tweens.add({
      targets: gfx,
      y: sy - Phaser.Math.FloatBetween(10, 20),
      x: sx + Phaser.Math.FloatBetween(-6, 6),
      alpha: 0,
      duration: life,
      ease: "Sine.easeOut",
      onComplete: () => {
        const idx = this.ambientParticles.indexOf(particle)
        if (idx !== -1) this.ambientParticles.splice(idx, 1)
        gfx.destroy()
      },
    })
    this.ambientParticles.push(particle)
  }

  // -----------------------------------------------------------------------
  // State entries
  // -----------------------------------------------------------------------

  private enterIdle(): void {
    if (!this.alive) return
    this.setEyes("open")
    this.flameIntensity = 1.0
    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - FLOAT_PX,
      duration: FLOAT_DURATION_MS, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    })
    this.scheduleBlink()
    this.scheduleLookAround()
    this.scheduleActivity()
  }

  private enterWalking(targetX: number, onComplete?: () => void): void {
    if (!this.alive) return
    const distance = Math.abs(targetX - this.x)
    if (distance < 2) {
      if (onComplete) onComplete()
      else { this.exitCurrentState(); this.currentState = "idle"; this.enterIdle() }
      return
    }

    this.setEyes("open")
    this.flameIntensity = 1.3
    const duration = (distance / WALK_SPEED_PX_PER_S) * 1000

    // Slight bobbing while moving
    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - 3,
      duration: 250, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    })

    this.walkTween = this.scene.tweens.add({
      targets: this, x: targetX,
      duration: Math.max(duration, WALK_MIN_DURATION_MS), ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.alive) return
        this.flameIntensity = 1.0
        if (onComplete) onComplete()
        else { this.exitCurrentState(); this.currentState = "idle"; this.enterIdle() }
      },
    })
  }

  private enterThinking(): void {
    if (!this.alive) return
    this.setEyes("open")
    this.flameIntensity = 0.7

    this.swayTween = this.scene.tweens.add({
      targets: this, x: this.x + SWAY_THINKING_PX,
      duration: SWAY_THINKING_DURATION_MS, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    })

    let dotIndex = 0
    this.dotsTimer = this.scene.time.addEvent({
      delay: THINKING_DOT_INTERVAL_MS, loop: true,
      callback: () => {
        if (!this.alive) return
        if (dotIndex < THINKING_DOT_COUNT) {
          this.thinkingDots[dotIndex].setAlpha(1)
          dotIndex++
        } else {
          for (const dot of this.thinkingDots) dot.setAlpha(0)
          dotIndex = 0
        }
      },
    })
  }

  private enterTalking(): void {
    if (!this.alive) return
    this.setEyes("open")
    this.flameIntensity = 1.4
    this.bounce()

    // Squish/stretch body during talking
    let squished = false
    this.talkTimer = this.scene.time.addEvent({
      delay: TALK_SQUISH_DURATION_MS, loop: true,
      callback: () => {
        if (!this.alive) return
        squished = !squished
        this.setEyes(squished ? "happy" : "open")
        if (this.squishTween) { this.squishTween.stop(); this.squishTween = null }
        this.squishTween = this.scene.tweens.add({
          targets: this.orbBody,
          scaleX: squished ? 1.08 : 1.0,
          scaleY: squished ? 0.92 : 1.0,
          duration: TALK_SQUISH_DURATION_MS * 0.5,
          ease: "Sine.easeInOut",
        })
      },
    })
  }

  private enterCelebrating(): void {
    if (!this.alive) return
    this.setEyes("wide")
    this.flameIntensity = 2.0

    const baseY = this.y
    this.jumpTween = this.scene.tweens.add({
      targets: this, y: baseY - CELEBRATE_JUMP_PX,
      duration: CELEBRATE_JUMP_DURATION_MS, ease: "Bounce.easeOut", yoyo: true,
      onComplete: () => {
        if (!this.alive) return
        this.y = baseY
        this.flameIntensity = 1.0
        this.trackedDelay(CELEBRATE_COOLDOWN_MS, () => {
          if (!this.alive) return
          this.exitCurrentState()
          this.currentState = "idle"
          this.enterIdle()
        })
      },
    })
  }

  private enterDancing(): void {
    if (!this.alive) return
    this.setEyes("happy")
    this.flameIntensity = 1.6

    this.swayTween = this.scene.tweens.add({
      targets: this, x: this.x + DANCE_SWAY_PX,
      duration: DANCE_SWAY_DURATION_MS, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    })
    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - DANCE_BOUNCE_PX,
      duration: DANCE_BOUNCE_DURATION_MS, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    })

    const duration = Phaser.Math.Between(DANCE_MIN_MS, DANCE_MAX_MS)
    this.trackedDelay(duration, () => {
      if (!this.alive) return
      this.exitCurrentState(); this.currentState = "idle"; this.enterIdle()
    })
  }

  private enterMeditating(): void {
    if (!this.alive) return
    this.setEyes("closed")
    this.flameIntensity = 0.5

    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - 2,
      duration: 3000, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    })

    const duration = Phaser.Math.Between(MEDITATE_MIN_MS, MEDITATE_MAX_MS)
    this.trackedDelay(duration, () => {
      if (!this.alive) return
      this.exitCurrentState(); this.currentState = "idle"; this.enterIdle()
    })
  }

  private enterSitting(): void {
    if (!this.alive) return
    this.setEyes("open")
    this.flameIntensity = 0.6

    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - 1,
      duration: 2200, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    })

    this.sleepTimer = this.scene.time.addEvent({
      delay: SITTING_SLEEP_DELAY_MS,
      callback: () => {
        if (!this.alive || this.currentState !== "sitting") return
        this.exitCurrentState(); this.currentState = "sleeping"; this.enterSleeping()
      },
    })
  }

  private enterSleeping(): void {
    if (!this.alive) return
    this.setEyes("closed")
    this.flameIntensity = 0.3

    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - 1,
      duration: 2800, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    })

    const zzzX = BODY_R * C + 4
    const zzzY = -(BODY_R * C) - 6
    this.zzzText = this.scene.add.text(zzzX, zzzY, "z", {
      fontSize: SLEEP_ZZZ_FONT_SIZE, color: "#80e8ff", fontFamily: "monospace",
    })
    this.add(this.zzzText)

    const animateZ = (): void => {
      if (!this.alive || !this.zzzText || this.currentState !== "sleeping") return
      this.zzzText.setPosition(zzzX, zzzY)
      this.zzzText.setAlpha(0.7)
      this.zzzTween = this.scene.tweens.add({
        targets: this.zzzText,
        y: zzzY - SLEEP_ZZZ_FLOAT_PX, alpha: 0,
        duration: SLEEP_ZZZ_FLOAT_DURATION_MS, ease: "Sine.easeOut",
        onComplete: () => {
          if (!this.alive) return
          this.trackedDelay(SLEEP_ZZZ_PAUSE_MS, animateZ)
        },
      })
    }
    animateZ()
  }

  private enterStretching(): void {
    if (!this.alive) return
    this.setEyes("wide")
    this.flameIntensity = 1.2

    // Scale stretch effect
    this.squishTween = this.scene.tweens.add({
      targets: this.orbBody, scaleY: 1.15, scaleX: 0.9,
      duration: 600, ease: "Sine.easeInOut", yoyo: true,
    })

    this.trackedDelay(1800, () => {
      if (!this.alive) return
      this.exitCurrentState(); this.currentState = "idle"; this.enterIdle()
    })
  }

  private enterExercising(): void {
    if (!this.alive) return
    this.setEyes("wide")
    this.flameIntensity = 1.8

    this.floatTween = this.scene.tweens.add({
      targets: this, y: this.y - 6,
      duration: 250, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
    })

    const duration = Phaser.Math.Between(3000, 7000)
    this.trackedDelay(duration, () => {
      if (!this.alive) return
      this.exitCurrentState(); this.currentState = "idle"; this.enterIdle()
    })
  }

  private enterCompacting(): void {
    if (!this.alive) return
    this.setEyes("closed")
    this.flameIntensity = 1.5

    this.trackedDelay(COMPACT_HOLD_MS, () => {
      if (!this.alive || this.currentState !== "compacting") return
      // Squish effect
      this.squishTween = this.scene.tweens.add({
        targets: this.orbBody, scaleX: 1.2, scaleY: 0.8,
        duration: 150, ease: "Quad.easeIn", yoyo: true, repeat: 1,
      })

      this.trackedDelay(COMPACT_SQUISH_MS, () => {
        if (!this.alive || this.currentState !== "compacting") return
        this.exitCurrentState(); this.currentState = "thinking"; this.enterThinking()
      })
    })
  }

  // -----------------------------------------------------------------------
  // State exit / cleanup
  // -----------------------------------------------------------------------

  private exitCurrentState(): void {
    if (this.floatTween) { this.floatTween.stop(); this.floatTween = null }
    if (this.swayTween) { this.swayTween.stop(); this.swayTween = null }
    if (this.walkTween) { this.walkTween.stop(); this.walkTween = null }
    if (this.bounceTween) { this.bounceTween.stop(); this.bounceTween = null }
    if (this.jumpTween) { this.jumpTween.stop(); this.jumpTween = null }
    if (this.squishTween) { this.squishTween.stop(); this.squishTween = null }
    if (this.blinkTimer) { this.blinkTimer.destroy(); this.blinkTimer = null }
    if (this.lookTimer) { this.lookTimer.destroy(); this.lookTimer = null }
    if (this.activityTimer) { this.activityTimer.destroy(); this.activityTimer = null }
    if (this.sleepTimer) { this.sleepTimer.destroy(); this.sleepTimer = null }
    if (this.dotsTimer) { this.dotsTimer.destroy(); this.dotsTimer = null }
    if (this.talkTimer) { this.talkTimer.destroy(); this.talkTimer = null }
    if (this.zzzTween) { this.zzzTween.stop(); this.zzzTween = null }
    if (this.zzzText) { this.zzzText.destroy(); this.zzzText = null }

    for (const dot of this.thinkingDots) {
      if (!dot.scene) continue
      dot.setAlpha(0)
    }

    // Reset body transform
    this.orbBody.setScale(1, 1)
    this.eyeExpression = "open"
    this.lookOffsetX = 0
    this.drawEyes()

    this.cancelPendingDelays()
  }

  // -----------------------------------------------------------------------
  // Timer helpers
  // -----------------------------------------------------------------------

  private scheduleBlink(): void {
    if (!this.alive) return
    const delay = Phaser.Math.Between(BLINK_MIN_MS, BLINK_MAX_MS)
    this.blinkTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return
        this.setEyes("closed")
        this.trackedDelay(BLINK_DURATION_MS, () => {
          if (!this.alive) return
          if (this.currentState === "idle") this.setEyes("open")
          this.scheduleBlink()
        })
      },
    })
  }

  private scheduleLookAround(): void {
    if (!this.alive) return
    const delay = Phaser.Math.Between(LOOK_AROUND_MIN_MS, LOOK_AROUND_MAX_MS)
    this.lookTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return
        // Shift pupils left
        this.lookOffsetX = -2
        this.drawEyes()
        this.trackedDelay(LOOK_GLANCE_MS, () => {
          if (!this.alive || this.currentState !== "idle") return
          // Shift right
          this.lookOffsetX = 2
          this.drawEyes()
          this.trackedDelay(LOOK_GLANCE_MS, () => {
            if (!this.alive || this.currentState !== "idle") return
            this.lookOffsetX = 0
            this.drawEyes()
            this.scheduleLookAround()
          })
        })
      },
    })
  }

  private scheduleActivity(): void {
    if (!this.alive) return
    const delay = Phaser.Math.Between(ACTIVITY_MIN_DELAY_MS, ACTIVITY_MAX_DELAY_MS)
    this.activityTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return

        if (this.activityCount >= 4) {
          this.exitCurrentState()
          this.currentState = "sitting"
          this.enterSitting()
          return
        }
        this.activityCount++

        const roll = Math.random()
        if (roll < 0.25) {
          // Wander
          const targetX = Phaser.Math.Between(this.minX, this.maxX)
          this.walkTo(targetX)
        } else if (roll < 0.50) {
          this.exitCurrentState(); this.currentState = "dancing"; this.enterDancing()
        } else if (roll < 0.70) {
          this.exitCurrentState(); this.currentState = "meditating"; this.enterMeditating()
        } else {
          this.exitCurrentState(); this.currentState = "sitting"; this.enterSitting()
        }
      },
    })
  }

  private trackedDelay(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    const timer = this.scene.time.delayedCall(delay, () => {
      const idx = this.pendingDelays.indexOf(timer)
      if (idx !== -1) this.pendingDelays.splice(idx, 1)
      callback()
    })
    this.pendingDelays.push(timer)
    return timer
  }

  private cancelPendingDelays(): void {
    for (const timer of this.pendingDelays) timer.destroy()
    this.pendingDelays.length = 0
  }
}

// ---------------------------------------------------------------------------
// Internal particle type
// ---------------------------------------------------------------------------

interface FlameParticle {
  gfx: Phaser.GameObjects.Graphics
  tween: Phaser.Tweens.Tween | null
}
