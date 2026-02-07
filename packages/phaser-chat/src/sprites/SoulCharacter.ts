import * as Phaser from "phaser";
import type {
  CanvasCharacterBlueprint,
  CharacterState,
  SoulState,
  SoulStage,
} from "@bibboy/shared";
import { createDefaultCanvasBlueprint } from "@bibboy/shared";
import { SOUL_PALETTE, SOUL_TEXTURE_MAP } from "./sprite-frames";

// ---------------------------------------------------------------------------
// Orb sizing & color palette
// ---------------------------------------------------------------------------

/** Scale factor applied to the 16×16 pixel art sprite. */
const SPRITE_SCALE = 3;

/** Colors for procedural effects (aura, flames, particles). */
const AURA_CYAN = 0x7fdfef;
const AURA_CYAN_ALPHA = 0.25;
const FLAME_ORANGE = 0xf0854a;
const FLAME_RED = 0xe05544;
const PARTICLE_CYAN = 0x80e8ff;
const FLAME_BRIGHT = 0xa0f0ff;
const FLAME_DARK = 0x5cb8d0;

/** Approximate rendered radius for positioning calculations. */
const ORB_RENDERED_RADIUS = (16 * SPRITE_SCALE) / 2;

/** Size of one visual "pixel" for procedural effects (matches sprite scale). */
const PIXEL = SPRITE_SCALE;

/** Snap a coordinate to the effect pixel grid for crisp pixel-art alignment. */
function snap(v: number): number {
  return Math.round(v / PIXEL) * PIXEL;
}

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const FLOAT_PX = 4;
const FLOAT_DURATION_MS = 1600;

const BOUNCE_OFFSET = 6;
const BOUNCE_DURATION_MS = 120;

const WALK_SPEED_PX_PER_S = 70;
const WALK_MIN_DURATION_MS = 200;

const SWAY_THINKING_PX = 2;
const SWAY_THINKING_DURATION_MS = 1200;

const ACTIVITY_MIN_DELAY_MS = 8000;
const ACTIVITY_MAX_DELAY_MS = 16000;

const CELEBRATE_JUMP_PX = 18;
const CELEBRATE_JUMP_DURATION_MS = 320;
const CELEBRATE_COOLDOWN_MS = 500;

const TALK_SQUISH_DURATION_MS = 200;

const THINKING_DOT_COLOR = 0x80e8ff;
const THINKING_DOT_RADIUS = 3;
const THINKING_DOT_SPACING = 10;
const THINKING_DOT_COUNT = 3;
const THINKING_DOT_INTERVAL_MS = 400;

const DANCE_SWAY_PX = 4;
const DANCE_SWAY_DURATION_MS = 350;
const DANCE_BOUNCE_PX = 5;
const DANCE_BOUNCE_DURATION_MS = 200;
const DANCE_MIN_MS = 4000;
const DANCE_MAX_MS = 9000;

const MEDITATE_MIN_MS = 10000;
const MEDITATE_MAX_MS = 18000;

const SLEEP_ZZZ_FONT_SIZE = "9px";
const SLEEP_ZZZ_FLOAT_PX = 16;
const SLEEP_ZZZ_FLOAT_DURATION_MS = 1500;
const SLEEP_ZZZ_PAUSE_MS = 600;
const SITTING_SLEEP_DELAY_MS = 20000;

const COMPACT_HOLD_MS = 500;
const COMPACT_SQUISH_MS = 400;

// Flame body animation
const FLAME_ANIM_INTERVAL_MS = 150;

// Flame body pixel: [x_offset, y_offset, color_hex]
type FPx = readonly [number, number, number];

const C = PARTICLE_CYAN;
const B = FLAME_BRIGHT;
const D = FLAME_DARK;
const O = FLAME_ORANGE;
const R = FLAME_RED;

// Shared wrap ring around the orb (drawn every frame)
const FLAME_WRAP: readonly FPx[] = [
  // Bottom
  [-3, 6, D],
  [-2, 6, C],
  [-1, 6, C],
  [0, 6, C],
  [1, 6, C],
  [2, 6, D],
  [-4, 5, D],
  [3, 5, D],
  // Left side
  [-7, -4, C],
  [-7, -3, C],
  [-7, -2, C],
  [-7, -1, C],
  [-7, 0, C],
  [-7, 1, C],
  [-7, 2, C],
  [-6, 3, D],
  [-6, -5, C],
  // Right side
  [6, -3, C],
  [6, -2, C],
  [6, -1, C],
  [6, 0, C],
  [6, 1, C],
  [6, 2, C],
  [5, 3, D],
  [5, -5, C],
  // Top corners
  [-5, -6, C],
  [4, -6, C],
  [-4, -7, C],
  [-3, -7, C],
  [2, -7, C],
  [3, -7, C],
  // Top arc
  [-2, -8, C],
  [-1, -8, B],
  [0, -8, B],
  [1, -8, C],
];

// 3 tongue animation frames (the flickering part)
const FLAME_TONGUES: readonly (readonly FPx[])[] = [
  // Frame 0 — left tongue tall, right shorter
  [
    // Left main tongue
    [-3, -8, C],
    [-4, -8, C],
    [-4, -9, C],
    [-5, -9, C],
    [-5, -10, C],
    [-4, -10, D],
    [-5, -11, C],
    [-4, -11, D],
    [-5, -12, C],
    [-5, -13, C],
    [-4, -14, C],
    [-4, -15, C],
    [-4, -16, O],
    // Right tongue
    [3, -8, C],
    [4, -9, C],
    [3, -9, C],
    [5, -10, C],
    [5, -11, C],
    [5, -12, O],
    // Fill between
    [-2, -9, D],
    [-1, -9, D],
    [0, -9, D],
    [1, -9, D],
    [2, -9, D],
    [-3, -10, D],
    [3, -10, D],
    // Accent wisps
    [-6, -7, D],
    [6, -6, D],
  ],
  // Frame 1 — tongues shifted
  [
    // Left main tongue (shifted right at top)
    [-5, -8, C],
    [-4, -8, C],
    [-5, -9, C],
    [-4, -9, C],
    [-4, -10, C],
    [-5, -10, D],
    [-4, -11, C],
    [-4, -12, C],
    [-3, -12, D],
    [-4, -13, C],
    [-3, -14, C],
    [-3, -15, O],
    // Right tongue (taller)
    [3, -8, C],
    [4, -9, C],
    [4, -10, C],
    [5, -10, D],
    [5, -11, C],
    [5, -12, C],
    [5, -13, O],
    // Fill between
    [-3, -9, D],
    [-2, -9, D],
    [-1, -9, D],
    [0, -9, D],
    [1, -9, D],
    [2, -9, D],
    [-3, -10, D],
    [3, -10, D],
    // Accent wisps
    [-3, -16, D],
    [6, -12, D],
  ],
  // Frame 2 — middle variation
  [
    // Left main tongue
    [-4, -8, C],
    [-3, -8, C],
    [-5, -9, C],
    [-4, -9, C],
    [-5, -10, C],
    [-5, -11, C],
    [-4, -11, D],
    [-5, -12, C],
    [-4, -12, D],
    [-5, -13, C],
    [-5, -14, C],
    [-5, -15, O],
    [-5, -16, R],
    // Right tongue
    [3, -8, C],
    [4, -8, D],
    [4, -9, C],
    [5, -9, D],
    [5, -10, C],
    [5, -11, C],
    [4, -11, D],
    [4, -12, O],
    // Fill between
    [-2, -9, D],
    [-1, -9, D],
    [0, -9, D],
    [1, -9, D],
    [2, -9, D],
    [-3, -10, D],
    [-2, -10, D],
    [3, -10, D],
    // Accent wisps
    [-6, -9, D],
    [7, -8, D],
  ],
];

// Small floating particles that detach from flame tips
const AMBIENT_PARTICLE_COUNT = 5;
const AMBIENT_SIZE = 1; // in sprite-pixel units
const AMBIENT_LIFE_MIN_MS = 600;
const AMBIENT_LIFE_MAX_MS = 1200;
const AMBIENT_SPAWN_INTERVAL_MS = 350;

// ---------------------------------------------------------------------------
// Texture key (generated once per scene)
// ---------------------------------------------------------------------------

const SOUL_TEXTURE_KEY = "soul-orb-idle";

// ---------------------------------------------------------------------------
// SoulCharacter — pixel art flame orb sprite
// ---------------------------------------------------------------------------

export class SoulCharacter extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly flameBody: Phaser.GameObjects.Graphics;
  private readonly thinkingDots: readonly Phaser.GameObjects.Arc[];

  private blueprint: CanvasCharacterBlueprint = createDefaultCanvasBlueprint();
  private currentState: CharacterState = "idle";
  private soulStage: SoulStage = "orb";
  private isDestroyed = false;

  private minX = 0;
  private maxX = 800;

  // Tweens
  private floatTween: Phaser.Tweens.Tween | null = null;
  private swayTween: Phaser.Tweens.Tween | null = null;
  private walkTween: Phaser.Tweens.Tween | null = null;
  private bounceTween: Phaser.Tweens.Tween | null = null;
  private jumpTween: Phaser.Tweens.Tween | null = null;
  private squishTween: Phaser.Tweens.Tween | null = null;

  // Timers
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private lookTimer: Phaser.Time.TimerEvent | null = null;
  private activityTimer: Phaser.Time.TimerEvent | null = null;
  private sleepTimer: Phaser.Time.TimerEvent | null = null;
  private dotsTimer: Phaser.Time.TimerEvent | null = null;
  private talkTimer: Phaser.Time.TimerEvent | null = null;
  private flameTimer: Phaser.Time.TimerEvent | null = null;
  private ambientTimer: Phaser.Time.TimerEvent | null = null;
  private readonly pendingDelays: Phaser.Time.TimerEvent[] = [];

  // Sleep decoration
  private zzzText: Phaser.GameObjects.Text | null = null;
  private zzzTween: Phaser.Tweens.Tween | null = null;

  // Flame body animation
  private flameFrame = 0;

  // Small ambient floating particles
  private readonly ambientParticles: FlameParticle[] = [];

  private activityCount = 0;
  private flameIntensity = 1.0; // multiplier for particle rate & size

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Generate the soul orb texture once if it doesn't exist yet
    if (!scene.textures.exists(SOUL_TEXTURE_KEY)) {
      scene.textures.generate(SOUL_TEXTURE_KEY, {
        data: SOUL_TEXTURE_MAP[SOUL_TEXTURE_KEY] as unknown as string[],
        pixelWidth: 1,
        pixelHeight: 1,
        palette: SOUL_PALETTE,
      });
    }

    // Aura glow layer (behind body)
    this.aura = scene.add.graphics();
    this.add(this.aura);

    // Flame body layer (between aura and orb)
    this.flameBody = scene.add.graphics();
    this.add(this.flameBody);

    // Pixel art orb sprite
    this.sprite = scene.add.image(0, 0, SOUL_TEXTURE_KEY);
    this.sprite.setScale(SPRITE_SCALE);
    // Crisp pixel rendering (no antialiasing)
    this.sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add(this.sprite);

    // Thinking dots
    const dotY = -ORB_RENDERED_RADIUS - 16;
    const dots: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < THINKING_DOT_COUNT; i++) {
      const dot = scene.add.circle(
        -THINKING_DOT_SPACING + i * THINKING_DOT_SPACING,
        dotY,
        THINKING_DOT_RADIUS,
        THINKING_DOT_COLOR,
      );
      dot.setAlpha(0);
      dots.push(dot);
      this.add(dot);
    }
    this.thinkingDots = dots;

    scene.add.existing(this);
    this.drawAura();
    this.drawFlameBody();
    this.startFlameAnimation();
    this.startAmbientParticles();
    this.enterIdle();
  }

  // -----------------------------------------------------------------------
  // Public API (PixelBoy-compatible)
  // -----------------------------------------------------------------------

  private get alive(): boolean {
    return !this.isDestroyed && this.scene?.sys != null;
  }

  setCharacterState(state: CharacterState): void {
    if (!this.alive) return;
    if (this.currentState === state) return;
    if (state === "thinking" || state === "talking") this.activityCount = 0;

    this.exitCurrentState();
    this.currentState = state;

    switch (state) {
      case "idle":
        this.enterIdle();
        break;
      case "walking":
        this.enterWalking(this.x);
        break;
      case "thinking":
        this.enterThinking();
        break;
      case "talking":
        this.enterTalking();
        break;
      case "celebrating":
        this.enterCelebrating();
        break;
      case "dancing":
        this.enterDancing();
        break;
      case "meditating":
        this.enterMeditating();
        break;
      case "sleeping":
        this.enterSleeping();
        break;
      case "sitting":
        this.enterSitting();
        break;
      case "compacting":
        this.enterCompacting();
        break;
      case "stretching":
        this.enterStretching();
        break;
      case "exercising":
        this.enterExercising();
        break;
      // Unsupported activity states → idle
      default:
        this.enterIdle();
        break;
    }
  }

  getCharacterState(): CharacterState {
    return this.currentState;
  }

  walkTo(targetX: number, onComplete?: () => void): void {
    if (!this.alive) return;
    this.exitCurrentState();
    this.currentState = "walking";
    this.enterWalking(targetX, onComplete);
  }

  bounce(): void {
    if (!this.alive) return;
    if (this.bounceTween) {
      this.bounceTween.stop();
      this.bounceTween = null;
    }
    const baseY = this.y;
    this.bounceTween = this.scene.tweens.add({
      targets: this,
      y: baseY - BOUNCE_OFFSET,
      duration: BOUNCE_DURATION_MS,
      ease: "Quad.easeOut",
      yoyo: true,
    });
  }

  setBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = maxX;
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
    };
  }

  setSoulState(state: SoulState): void {
    this.soulStage = state.stage;
  }
  setSoulStage(stage: SoulStage): void {
    const prev = this.soulStage;
    this.soulStage = stage;
    if (prev !== stage) {
      // Flash + intensity burst on evolution
      this.flameIntensity = 2.0;
      this.scene.tweens.add({
        targets: this.aura,
        alpha: 1,
        duration: 200,
        yoyo: true,
        onComplete: () => {
          this.flameIntensity = 1.0;
        },
      });
    }
  }

  flash(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.4,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  destroy(fromScene?: boolean): void {
    this.isDestroyed = true;
    this.exitCurrentState();
    this.stopFlameAnimation();
    this.stopAmbientParticles();
    super.destroy(fromScene);
  }

  // -----------------------------------------------------------------------
  // Aura drawing (procedural glow behind the pixel art)
  // -----------------------------------------------------------------------

  private drawAura(): void {
    this.aura.clear();
    const r = Math.ceil((ORB_RENDERED_RADIUS + 6) / PIXEL); // radius in sprite-pixel units
    const half = Math.floor(PIXEL / 2);

    for (let py = -r; py <= r; py++) {
      for (let px = -r; px <= r; px++) {
        const dist = Math.sqrt(px * px + py * py);
        if (dist > r) continue;

        // Dither outermost ring with checkerboard for a pixel-art edge
        const edge = r - dist;
        if (edge < 1 && (px + py) % 2 !== 0) continue;

        const alpha = edge < 2 ? AURA_CYAN_ALPHA * 0.5 : AURA_CYAN_ALPHA;
        this.aura.fillStyle(AURA_CYAN, alpha);
        this.aura.fillRect(px * PIXEL - half, py * PIXEL - half, PIXEL, PIXEL);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Flame body (structured pixel-art flame shape around the orb)
  // -----------------------------------------------------------------------

  private startFlameAnimation(): void {
    this.flameTimer = this.scene.time.addEvent({
      delay: FLAME_ANIM_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return;
        this.flameFrame = (this.flameFrame + 1) % FLAME_TONGUES.length;
        this.drawFlameBody();
      },
    });
  }

  private stopFlameAnimation(): void {
    if (this.flameTimer) {
      this.flameTimer.destroy();
      this.flameTimer = null;
    }
  }

  /** Draw the structured flame body — wrap ring + animated tongues. */
  private drawFlameBody(): void {
    this.flameBody.clear();
    const intensity = this.flameIntensity;
    const baseAlpha = Math.min(intensity, 1.0) * 0.85;

    // Draw the wrap ring
    for (const [px, py, color] of FLAME_WRAP) {
      this.flameBody.fillStyle(color, baseAlpha);
      this.flameBody.fillRect(px * PIXEL, py * PIXEL, PIXEL, PIXEL);
    }

    // Draw animated tongue pixels (y scaled by intensity)
    const tongues = FLAME_TONGUES[this.flameFrame];
    for (const [px, py, color] of tongues) {
      const scaledY = Math.round(py * intensity);
      this.flameBody.fillStyle(color, baseAlpha);
      this.flameBody.fillRect(px * PIXEL, scaledY * PIXEL, PIXEL, PIXEL);
    }

    // When intensity > 1.3, add extra accent pixels for a bigger flame
    if (intensity > 1.3) {
      const extras: FPx[] = [
        [-6, -8, C],
        [7, -7, C],
        [-5, -17, D],
        [6, -13, D],
        [-3, -17, O],
        [6, -14, O],
      ];
      for (const [px, py, color] of extras) {
        const scaledY = Math.round(py * intensity);
        this.flameBody.fillStyle(color, baseAlpha * 0.7);
        this.flameBody.fillRect(px * PIXEL, scaledY * PIXEL, PIXEL, PIXEL);
      }
    }
  }

  // Small ambient floating particles
  private startAmbientParticles(): void {
    this.ambientTimer = this.scene.time.addEvent({
      delay: AMBIENT_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return;
        this.spawnAmbientParticle();
      },
    });
  }

  private stopAmbientParticles(): void {
    if (this.ambientTimer) {
      this.ambientTimer.destroy();
      this.ambientTimer = null;
    }
    for (const p of this.ambientParticles) {
      if (p.tween) p.tween.stop();
      p.gfx.destroy();
    }
    this.ambientParticles.length = 0;
  }

  private spawnAmbientParticle(): void {
    if (this.ambientParticles.length >= AMBIENT_PARTICLE_COUNT) return;

    // Spawn from near flame tongue tips (not random around orb)
    const tongues = FLAME_TONGUES[this.flameFrame];
    // Pick a random pixel from the current tongue frame as spawn origin
    const origin = tongues[Phaser.Math.Between(0, tongues.length - 1)];
    const sx = snap(origin[0] * PIXEL + Phaser.Math.FloatBetween(-PIXEL, PIXEL));
    const sy = snap(origin[1] * PIXEL * this.flameIntensity);

    const size = AMBIENT_SIZE * PIXEL;
    const color =
      Math.random() < 0.7 ? PARTICLE_CYAN : Math.random() < 0.5 ? FLAME_ORANGE : FLAME_RED;
    const life = Phaser.Math.Between(AMBIENT_LIFE_MIN_MS, AMBIENT_LIFE_MAX_MS);

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(color, 0.7);
    gfx.fillRect(0, 0, size, size);
    gfx.setPosition(sx, sy);
    this.add(gfx);

    const particle: FlameParticle = { gfx, tween: null };
    particle.tween = this.scene.tweens.add({
      targets: gfx,
      y: snap(sy - Phaser.Math.FloatBetween(12, 30)),
      x: snap(sx + Phaser.Math.FloatBetween(-9, 9)),
      alpha: 0,
      duration: life,
      ease: "Sine.easeOut",
      onUpdate: () => {
        gfx.setPosition(snap(gfx.x), snap(gfx.y));
      },
      onComplete: () => {
        const idx = this.ambientParticles.indexOf(particle);
        if (idx !== -1) this.ambientParticles.splice(idx, 1);
        gfx.destroy();
      },
    });
    this.ambientParticles.push(particle);
  }

  // -----------------------------------------------------------------------
  // State entries
  // -----------------------------------------------------------------------

  private enterIdle(): void {
    if (!this.alive) return;
    this.flameIntensity = 1.0;
    this.drawFlameBody();
    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - FLOAT_PX,
      duration: FLOAT_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.scheduleActivity();
  }

  private enterWalking(targetX: number, onComplete?: () => void): void {
    if (!this.alive) return;
    const distance = Math.abs(targetX - this.x);
    if (distance < 2) {
      if (onComplete) onComplete();
      else {
        this.exitCurrentState();
        this.currentState = "idle";
        this.enterIdle();
      }
      return;
    }

    this.flameIntensity = 1.3;
    this.drawFlameBody();
    const duration = (distance / WALK_SPEED_PX_PER_S) * 1000;

    // Slight bobbing while moving
    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 3,
      duration: 250,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.walkTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      duration: Math.max(duration, WALK_MIN_DURATION_MS),
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.alive) return;
        this.flameIntensity = 1.0;
        if (onComplete) onComplete();
        else {
          this.exitCurrentState();
          this.currentState = "idle";
          this.enterIdle();
        }
      },
    });
  }

  private enterThinking(): void {
    if (!this.alive) return;
    this.flameIntensity = 0.7;
    this.drawFlameBody();

    this.swayTween = this.scene.tweens.add({
      targets: this,
      x: this.x + SWAY_THINKING_PX,
      duration: SWAY_THINKING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    let dotIndex = 0;
    this.dotsTimer = this.scene.time.addEvent({
      delay: THINKING_DOT_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return;
        if (dotIndex < THINKING_DOT_COUNT) {
          this.thinkingDots[dotIndex].setAlpha(1);
          dotIndex++;
        } else {
          for (const dot of this.thinkingDots) dot.setAlpha(0);
          dotIndex = 0;
        }
      },
    });
  }

  private enterTalking(): void {
    if (!this.alive) return;
    this.flameIntensity = 1.4;
    this.drawFlameBody();
    this.bounce();

    // Squish/stretch body during talking
    let squished = false;
    this.talkTimer = this.scene.time.addEvent({
      delay: TALK_SQUISH_DURATION_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return;
        squished = !squished;
        if (this.squishTween) {
          this.squishTween.stop();
          this.squishTween = null;
        }
        this.squishTween = this.scene.tweens.add({
          targets: this.sprite,
          scaleX: squished ? SPRITE_SCALE * 1.08 : SPRITE_SCALE,
          scaleY: squished ? SPRITE_SCALE * 0.92 : SPRITE_SCALE,
          duration: TALK_SQUISH_DURATION_MS * 0.5,
          ease: "Sine.easeInOut",
        });
      },
    });
  }

  private enterCelebrating(): void {
    if (!this.alive) return;
    this.flameIntensity = 2.0;
    this.drawFlameBody();

    const baseY = this.y;
    this.jumpTween = this.scene.tweens.add({
      targets: this,
      y: baseY - CELEBRATE_JUMP_PX,
      duration: CELEBRATE_JUMP_DURATION_MS,
      ease: "Bounce.easeOut",
      yoyo: true,
      onComplete: () => {
        if (!this.alive) return;
        this.y = baseY;
        this.flameIntensity = 1.0;
        this.trackedDelay(CELEBRATE_COOLDOWN_MS, () => {
          if (!this.alive) return;
          this.exitCurrentState();
          this.currentState = "idle";
          this.enterIdle();
        });
      },
    });
  }

  private enterDancing(): void {
    if (!this.alive) return;
    this.flameIntensity = 1.6;
    this.drawFlameBody();

    this.swayTween = this.scene.tweens.add({
      targets: this,
      x: this.x + DANCE_SWAY_PX,
      duration: DANCE_SWAY_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - DANCE_BOUNCE_PX,
      duration: DANCE_BOUNCE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(DANCE_MIN_MS, DANCE_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterMeditating(): void {
    if (!this.alive) return;
    this.flameIntensity = 0.5;
    this.drawFlameBody();

    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 2,
      duration: 3000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(MEDITATE_MIN_MS, MEDITATE_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterSitting(): void {
    if (!this.alive) return;
    this.flameIntensity = 0.6;
    this.drawFlameBody();

    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 1,
      duration: 2200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.sleepTimer = this.scene.time.addEvent({
      delay: SITTING_SLEEP_DELAY_MS,
      callback: () => {
        if (!this.alive || this.currentState !== "sitting") return;
        this.exitCurrentState();
        this.currentState = "sleeping";
        this.enterSleeping();
      },
    });
  }

  private enterSleeping(): void {
    if (!this.alive) return;
    this.flameIntensity = 0.3;
    this.drawFlameBody();

    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 1,
      duration: 2800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const zzzX = ORB_RENDERED_RADIUS + 4;
    const zzzY = -ORB_RENDERED_RADIUS - 6;
    this.zzzText = this.scene.add.text(zzzX, zzzY, "z", {
      fontSize: SLEEP_ZZZ_FONT_SIZE,
      color: "#80e8ff",
      fontFamily: "monospace",
    });
    this.add(this.zzzText);

    const animateZ = (): void => {
      if (!this.alive || !this.zzzText || this.currentState !== "sleeping") return;
      this.zzzText.setPosition(zzzX, zzzY);
      this.zzzText.setAlpha(0.7);
      this.zzzTween = this.scene.tweens.add({
        targets: this.zzzText,
        y: zzzY - SLEEP_ZZZ_FLOAT_PX,
        alpha: 0,
        duration: SLEEP_ZZZ_FLOAT_DURATION_MS,
        ease: "Sine.easeOut",
        onComplete: () => {
          if (!this.alive) return;
          this.trackedDelay(SLEEP_ZZZ_PAUSE_MS, animateZ);
        },
      });
    };
    animateZ();
  }

  private enterStretching(): void {
    if (!this.alive) return;
    this.flameIntensity = 1.2;
    this.drawFlameBody();

    // Scale stretch effect
    this.squishTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: SPRITE_SCALE * 1.15,
      scaleX: SPRITE_SCALE * 0.9,
      duration: 600,
      ease: "Sine.easeInOut",
      yoyo: true,
    });

    this.trackedDelay(1800, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterExercising(): void {
    if (!this.alive) return;
    this.flameIntensity = 1.8;
    this.drawFlameBody();

    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 6,
      duration: 250,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(3000, 7000);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterCompacting(): void {
    if (!this.alive) return;
    this.flameIntensity = 1.5;
    this.drawFlameBody();

    this.trackedDelay(COMPACT_HOLD_MS, () => {
      if (!this.alive || this.currentState !== "compacting") return;
      // Squish effect
      this.squishTween = this.scene.tweens.add({
        targets: this.sprite,
        scaleX: SPRITE_SCALE * 1.2,
        scaleY: SPRITE_SCALE * 0.8,
        duration: 150,
        ease: "Quad.easeIn",
        yoyo: true,
        repeat: 1,
      });

      this.trackedDelay(COMPACT_SQUISH_MS, () => {
        if (!this.alive || this.currentState !== "compacting") return;
        this.exitCurrentState();
        this.currentState = "thinking";
        this.enterThinking();
      });
    });
  }

  // -----------------------------------------------------------------------
  // State exit / cleanup
  // -----------------------------------------------------------------------

  private exitCurrentState(): void {
    if (this.floatTween) {
      this.floatTween.stop();
      this.floatTween = null;
    }
    if (this.swayTween) {
      this.swayTween.stop();
      this.swayTween = null;
    }
    if (this.walkTween) {
      this.walkTween.stop();
      this.walkTween = null;
    }
    if (this.bounceTween) {
      this.bounceTween.stop();
      this.bounceTween = null;
    }
    if (this.jumpTween) {
      this.jumpTween.stop();
      this.jumpTween = null;
    }
    if (this.squishTween) {
      this.squishTween.stop();
      this.squishTween = null;
    }
    if (this.blinkTimer) {
      this.blinkTimer.destroy();
      this.blinkTimer = null;
    }
    if (this.lookTimer) {
      this.lookTimer.destroy();
      this.lookTimer = null;
    }
    if (this.activityTimer) {
      this.activityTimer.destroy();
      this.activityTimer = null;
    }
    if (this.sleepTimer) {
      this.sleepTimer.destroy();
      this.sleepTimer = null;
    }
    if (this.dotsTimer) {
      this.dotsTimer.destroy();
      this.dotsTimer = null;
    }
    if (this.talkTimer) {
      this.talkTimer.destroy();
      this.talkTimer = null;
    }
    if (this.zzzTween) {
      this.zzzTween.stop();
      this.zzzTween = null;
    }
    if (this.zzzText) {
      this.zzzText.destroy();
      this.zzzText = null;
    }

    for (const dot of this.thinkingDots) {
      if (!dot.scene) continue;
      dot.setAlpha(0);
    }

    // Reset sprite transform
    this.sprite.setScale(SPRITE_SCALE);

    this.cancelPendingDelays();
  }

  // -----------------------------------------------------------------------
  // Timer helpers
  // -----------------------------------------------------------------------

  private scheduleActivity(): void {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(ACTIVITY_MIN_DELAY_MS, ACTIVITY_MAX_DELAY_MS);
    this.activityTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return;

        if (this.activityCount >= 4) {
          this.exitCurrentState();
          this.currentState = "sitting";
          this.enterSitting();
          return;
        }
        this.activityCount++;

        const roll = Math.random();
        if (roll < 0.25) {
          // Wander
          const targetX = Phaser.Math.Between(this.minX, this.maxX);
          this.walkTo(targetX);
        } else if (roll < 0.5) {
          this.exitCurrentState();
          this.currentState = "dancing";
          this.enterDancing();
        } else if (roll < 0.7) {
          this.exitCurrentState();
          this.currentState = "meditating";
          this.enterMeditating();
        } else {
          this.exitCurrentState();
          this.currentState = "sitting";
          this.enterSitting();
        }
      },
    });
  }

  private trackedDelay(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    const timer = this.scene.time.delayedCall(delay, () => {
      const idx = this.pendingDelays.indexOf(timer);
      if (idx !== -1) this.pendingDelays.splice(idx, 1);
      callback();
    });
    this.pendingDelays.push(timer);
    return timer;
  }

  private cancelPendingDelays(): void {
    for (const timer of this.pendingDelays) timer.destroy();
    this.pendingDelays.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Internal particle type
// ---------------------------------------------------------------------------

interface FlameParticle {
  gfx: Phaser.GameObjects.Graphics;
  tween: Phaser.Tweens.Tween | null;
}
