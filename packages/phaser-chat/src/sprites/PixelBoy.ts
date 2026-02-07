import * as Phaser from "phaser";
import type { CharacterState } from "@bibboy/shared";
import { PALETTE, TEXTURE_MAP, type TextureKey } from "./sprite-frames";

// ---------------------------------------------------------------------------
// Animation & layout constants
// ---------------------------------------------------------------------------

const THINKING_DOT_COLOR = 0x4a90d9;
const THINKING_DOT_RADIUS = 4;
const THINKING_DOT_SPACING = 12;
const THINKING_DOT_COUNT = 3;
const THINKING_DOT_OFFSET_Y = 12;

const BOUNCE_OFFSET = 4;
const BOUNCE_DURATION_MS = 100;

const WALK_SPEED_PX_PER_S = 80;
const WALK_LEAN_PX = 2;
const WALK_LEAN_DURATION_MS = 200;
const WALK_STEP_HALF_MS = 200;
const WALK_BOB_PX = 3;
const WALK_LANDING_BOB_PX = 2;
const WALK_LANDING_DURATION_MS = 120;
const WALK_MIN_DURATION_MS = 200;

const BOB_IDLE_PX = 1;
const BOB_IDLE_DURATION_MS = 1500;
const BOB_BREATHING_DURATION_MS = 2000;
const BOB_SLOW_BREATHING_DURATION_MS = 2500;
const BOB_MEDITATION_DURATION_MS = 3000;
const BOB_TYPING_DURATION_MS = 300;

const SWAY_THINKING_PX = 1;
const SWAY_THINKING_DURATION_MS = 1000;
const SWAY_PHONE_DURATION_MS = 1200;
const SWAY_DANCE_PX = 3;
const SWAY_DANCE_DURATION_MS = 400;

const THINKING_DOT_INTERVAL_MS = 400;
const TALK_MOUTH_TOGGLE_MS = 250;

const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 5000;
const BLINK_DURATION_MS = 120;

const LOOK_AROUND_MIN_MS = 8000;
const LOOK_AROUND_MAX_MS = 15000;
const LOOK_GLANCE_MS = 400;
const LOOK_PAUSE_MS = 300;

const ACTIVITY_MIN_DELAY_MS = 6000;
const ACTIVITY_MAX_DELAY_MS = 14000;
const ACTIVITY_SETTLE_THRESHOLD = 4;

const YAWN_STRETCH_PX = 2;
const YAWN_STRETCH_DURATION_MS = 600;
const YAWN_TOTAL_MS = 1800;

const PHONE_MIN_MS = 5000;
const PHONE_MAX_MS = 8000;

const READING_PAGE_TURN_MIN_MS = 3000;
const READING_PAGE_TURN_MAX_MS = 5000;
const READING_PAGE_TURN_SWAP_MS = 300;
const READING_TOTAL_MIN_MS = 12000;
const READING_TOTAL_MAX_MS = 18000;

const WORKING_PAUSE_MIN_MS = 4000;
const WORKING_PAUSE_MAX_MS = 7000;
const WORKING_LOOK_UP_MS = 800;
const WORKING_TOTAL_MIN_MS = 12000;
const WORKING_TOTAL_MAX_MS = 18000;

const STRETCH_PX = 3;
const STRETCH_DURATION_MS = 800;
const STRETCH_TOTAL_MS = 2000;

const COFFEE_SIP_INTERVAL_MS = 2000;
const COFFEE_MIN_MS = 6000;
const COFFEE_MAX_MS = 10000;

const EXERCISE_FRAME_INTERVAL_MS = 500;
const EXERCISE_BOUNCE_PX = 4;
const EXERCISE_BOUNCE_DURATION_MS = 250;
const EXERCISE_MIN_MS = 4000;
const EXERCISE_MAX_MS = 8000;

const DANCE_BOUNCE_PX = 3;
const DANCE_BOUNCE_DURATION_MS = 200;
const DANCE_MIN_MS = 5000;
const DANCE_MAX_MS = 10000;

const MEDITATE_MIN_MS = 15000;
const MEDITATE_MAX_MS = 25000;

const SITTING_SLEEP_DELAY_MS = 25000;

const SLEEP_ZZZ_OFFSET_X = 10;
const SLEEP_ZZZ_FONT_SIZE = "11px";
const SLEEP_ZZZ_FLOAT_PX = 18;
const SLEEP_ZZZ_FLOAT_DURATION_MS = 1500;
const SLEEP_ZZZ_PAUSE_MS = 500;

const CELEBRATE_JUMP_PX = 20;
const CELEBRATE_JUMP_DURATION_MS = 300;
const CELEBRATE_COOLDOWN_MS = 400;

const COMPACT_HOLD_MS = 600;
const COMPACT_SQUISH_BOB_PX = 2;
const COMPACT_SQUISH_BOB_DURATION_MS = 150;
const COMPACT_SQUISH_MS = 500;
const COMPACT_PAPER_SCALE_RATIO = 0.8;
const COMPACT_HAND_X_RATIO = 45 / 5;
const COMPACT_HAND_Y_RATIO = 0.35;
const COMPACT_ARC_PX = 80;
const COMPACT_FLIGHT_DURATION_MS = 600;
const COMPACT_GRAVITY_PULL_PX = 40;
const COMPACT_GRAVITY_DELAY_MS = 100;
const COMPACT_ROTATION_PER_FRAME = 8;
const COMPACT_OFFSCREEN_MARGIN = 60;
const COMPACT_POST_THROW_MS = 300;

// Activity probability thresholds (cumulative)
const ACTIVITY_WEIGHTS = {
  WANDER: 0.15,
  YAWN: 0.25,
  PHONE: 0.35,
  READ: 0.50,
  WORK: 0.65,
  STRETCH: 0.72,
  COFFEE: 0.79,
  EXERCISE: 0.86,
  DANCE: 0.93,
} as const;

// ---------------------------------------------------------------------------
// Texture generation helper
// ---------------------------------------------------------------------------

function generateTexture(
  scene: Phaser.Scene,
  key: string,
  data: readonly string[],
): void {
  if (scene.textures.exists(key)) return;

  scene.textures.generate(key, {
    data: data as string[],
    pixelWidth: 1,
    pixelHeight: 1,
    palette: PALETTE,
  });
}

// ---------------------------------------------------------------------------
// PixelBoy — the main sprite class
// ---------------------------------------------------------------------------

export class PixelBoy extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly thinkingDots: readonly Phaser.GameObjects.Arc[];

  private currentState: CharacterState = "idle";
  private minX = 0;
  private maxX = 800;
  private isDestroyed = false;

  // Tweens we need to track for cleanup
  private bobTween: Phaser.Tweens.Tween | null = null;
  private walkTween: Phaser.Tweens.Tween | null = null;
  private bounceTween: Phaser.Tweens.Tween | null = null;
  private dotsTimer: Phaser.Time.TimerEvent | null = null;
  private swayTween: Phaser.Tweens.Tween | null = null;

  // Timers
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private walkFrameTimer: Phaser.Time.TimerEvent | null = null;
  private talkTimer: Phaser.Time.TimerEvent | null = null;
  private lookTimer: Phaser.Time.TimerEvent | null = null;
  private sleepTimer: Phaser.Time.TimerEvent | null = null;
  private activityTimer: Phaser.Time.TimerEvent | null = null;
  private jumpTween: Phaser.Tweens.Tween | null = null;
  private zzzText: Phaser.GameObjects.Text | null = null;
  private zzzTween: Phaser.Tweens.Tween | null = null;
  private paperBall: Phaser.GameObjects.Image | null = null;
  private paperBallTween: Phaser.Tweens.Tween | null = null;

  // Track all delayedCall timers so they can be cancelled on state exit
  private readonly pendingDelays: Phaser.Time.TimerEvent[] = [];

  // Walk animation frame toggle
  private walkFrame = false;

  // Activity counter — after several activities the boy settles down
  private activityCount = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, scale = 5) {
    super(scene, x, y);

    this.generateAllTextures();

    this.sprite = scene.add.image(0, 0, "boy-idle-1");
    this.sprite.setScale(scale);
    this.sprite.setOrigin(0.5, 1);
    this.add(this.sprite);

    // Create thinking dots (hidden by default)
    const dots: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < THINKING_DOT_COUNT; i++) {
      const dot = scene.add.circle(
        -THINKING_DOT_SPACING + i * THINKING_DOT_SPACING,
        -this.sprite.displayHeight - THINKING_DOT_OFFSET_Y,
        THINKING_DOT_RADIUS,
        THINKING_DOT_COLOR,
      );
      dot.setAlpha(0);
      dots.push(dot);
      this.add(dot);
    }
    this.thinkingDots = dots;

    scene.add.existing(this);
    this.enterIdle();
  }

  // -----------------------------------------------------------------------
  // Texture generation
  // -----------------------------------------------------------------------

  private generateAllTextures(): void {
    for (const [key, data] of Object.entries(TEXTURE_MAP)) {
      generateTexture(this.scene, key, data);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  private get alive(): boolean {
    return !this.isDestroyed && this.scene?.sys != null;
  }

  setCharacterState(state: CharacterState): void {
    if (!this.alive) return;
    if (this.currentState === state) return;

    if (state === "thinking" || state === "talking") {
      this.activityCount = 0;
    }

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
      case "sitting":
        this.enterSitting();
        break;
      case "sleeping":
        this.enterSleeping();
        break;
      case "celebrating":
        this.enterCelebrating();
        break;
      case "yawning":
        this.enterYawning();
        break;
      case "phoneChecking":
        this.enterPhoneChecking();
        break;
      case "reading":
        this.enterReading();
        break;
      case "working":
        this.enterWorking();
        break;
      case "compacting":
        this.enterCompacting();
        break;
      case "stretching":
        this.enterStretching();
        break;
      case "drinkingCoffee":
        this.enterDrinkingCoffee();
        break;
      case "exercising":
        this.enterExercising();
        break;
      case "dancing":
        this.enterDancing();
        break;
      case "meditating":
        this.enterMeditating();
        break;
    }
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

    this.bounceTween = this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - BOUNCE_OFFSET,
      duration: BOUNCE_DURATION_MS,
      ease: "Quad.easeOut",
      yoyo: true,
    });
  }

  setBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = maxX;
  }

  getCharacterState(): CharacterState {
    return this.currentState;
  }

  destroy(fromScene?: boolean): void {
    this.isDestroyed = true;
    this.exitCurrentState();
    super.destroy(fromScene);
  }

  // -----------------------------------------------------------------------
  // State entry helpers
  // -----------------------------------------------------------------------

  private enterIdle(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-idle-1");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - BOB_IDLE_PX,
      duration: BOB_IDLE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.scheduleBlink();
    this.scheduleLookAround();
    this.scheduleActivity();
  }

  private enterWalking(targetX: number, onComplete?: () => void): void {
    if (!this.alive) return;
    this.sprite.y = 0;

    const distance = Math.abs(targetX - this.x);
    if (distance < 2) {
      if (onComplete) {
        onComplete();
      } else {
        this.exitCurrentState();
        this.currentState = "idle";
        this.enterIdle();
      }
      return;
    }

    const duration = (distance / WALK_SPEED_PX_PER_S) * 1000;
    const direction = targetX > this.x ? 1 : -1;

    this.sprite.setFlipX(direction < 0);
    this.sprite.setTexture("boy-walk-1");
    this.walkFrame = false;

    this.swayTween = this.scene.tweens.add({
      targets: this.sprite,
      x: direction * WALK_LEAN_PX,
      duration: WALK_LEAN_DURATION_MS,
      ease: "Sine.easeOut",
    });

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -WALK_BOB_PX,
      duration: WALK_STEP_HALF_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.walkFrameTimer = this.scene.time.addEvent({
      delay: WALK_STEP_HALF_MS * 2,
      loop: true,
      callback: () => {
        if (!this.alive) return;
        this.walkFrame = !this.walkFrame;
        this.sprite.setTexture(this.walkFrame ? "boy-walk-2" : "boy-walk-1");
      },
    });

    this.walkTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      duration: Math.max(duration, WALK_MIN_DURATION_MS),
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.alive) return;
        this.stopWalkFrameTimer();

        if (this.bobTween) {
          this.bobTween.stop();
          this.bobTween = null;
        }

        this.sprite.setTexture("boy-idle-1");

        this.scene.tweens.add({
          targets: this.sprite,
          y: -WALK_LANDING_BOB_PX,
          duration: WALK_LANDING_DURATION_MS,
          ease: "Quad.easeOut",
          yoyo: true,
          onComplete: () => {
            if (!this.alive) return;
            this.sprite.y = 0;
            this.sprite.x = 0;
            if (onComplete) {
              onComplete();
            } else {
              this.exitCurrentState();
              this.currentState = "idle";
              this.enterIdle();
            }
          },
        });
      },
    });
  }

  private enterThinking(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.x = 0;
    this.sprite.setFlipX(false);
    this.sprite.setTexture("boy-think");

    this.swayTween = this.scene.tweens.add({
      targets: this.sprite,
      x: SWAY_THINKING_PX,
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
          for (const dot of this.thinkingDots) {
            dot.setAlpha(0);
          }
          dotIndex = 0;
        }
      },
    });
  }

  private enterTalking(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-talk");
    this.bounce();

    let mouthOpen = true;
    this.talkTimer = this.scene.time.addEvent({
      delay: TALK_MOUTH_TOGGLE_MS,
      loop: true,
      callback: () => {
        if (!this.alive) return;
        mouthOpen = !mouthOpen;
        this.sprite.setTexture(mouthOpen ? "boy-talk" : "boy-idle-1");
      },
    });
  }

  private enterSitting(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-sit");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
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
    this.sprite.y = 0;
    this.sprite.setTexture("boy-idle-2");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_SLOW_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.zzzText = this.scene.add.text(
      SLEEP_ZZZ_OFFSET_X, -this.sprite.displayHeight - SLEEP_ZZZ_OFFSET_X,
      "z",
      { fontSize: SLEEP_ZZZ_FONT_SIZE, color: "#BBBBBB", fontFamily: "monospace" },
    );
    this.add(this.zzzText);

    const animateZ = (): void => {
      if (!this.alive || !this.zzzText || this.currentState !== "sleeping") return;
      this.zzzText.setPosition(SLEEP_ZZZ_OFFSET_X, -this.sprite.displayHeight - SLEEP_ZZZ_OFFSET_X);
      this.zzzText.setAlpha(0.7);

      this.zzzTween = this.scene.tweens.add({
        targets: this.zzzText,
        y: this.zzzText.y - SLEEP_ZZZ_FLOAT_PX,
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

  private enterCelebrating(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setFlipX(false);
    this.sprite.setTexture("boy-wave-1");

    this.jumpTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -CELEBRATE_JUMP_PX,
      duration: CELEBRATE_JUMP_DURATION_MS,
      ease: "Bounce.easeOut",
      yoyo: true,
      onComplete: () => {
        if (!this.alive) return;
        this.sprite.y = 0;
        this.trackedDelay(CELEBRATE_COOLDOWN_MS, () => {
          if (!this.alive) return;
          this.exitCurrentState();
          this.currentState = "idle";
          this.enterIdle();
        });
      },
    });
  }

  // -----------------------------------------------------------------------
  // Activity states
  // -----------------------------------------------------------------------

  private enterYawning(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-yawn");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -YAWN_STRETCH_PX,
      duration: YAWN_STRETCH_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
    });

    this.trackedDelay(YAWN_TOTAL_MS, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterPhoneChecking(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-phone");

    this.swayTween = this.scene.tweens.add({
      targets: this.sprite,
      x: SWAY_THINKING_PX,
      duration: SWAY_PHONE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(PHONE_MIN_MS, PHONE_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterReading(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-sit-read");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const schedulePageTurn = (): void => {
      if (!this.alive || this.currentState !== "reading") return;
      const delay = Phaser.Math.Between(READING_PAGE_TURN_MIN_MS, READING_PAGE_TURN_MAX_MS);
      this.trackedDelay(delay, () => {
        if (!this.alive || this.currentState !== "reading") return;
        this.sprite.setTexture("boy-sit");
        this.trackedDelay(READING_PAGE_TURN_SWAP_MS, () => {
          if (!this.alive || this.currentState !== "reading") return;
          this.sprite.setTexture("boy-sit-read");
          schedulePageTurn();
        });
      });
    };
    schedulePageTurn();

    const duration = Phaser.Math.Between(READING_TOTAL_MIN_MS, READING_TOTAL_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterWorking(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-sit-laptop");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_TYPING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const scheduleTypingPause = (): void => {
      if (!this.alive || this.currentState !== "working") return;
      const delay = Phaser.Math.Between(WORKING_PAUSE_MIN_MS, WORKING_PAUSE_MAX_MS);
      this.trackedDelay(delay, () => {
        if (!this.alive || this.currentState !== "working") return;
        this.sprite.setTexture("boy-sit");
        this.trackedDelay(WORKING_LOOK_UP_MS, () => {
          if (!this.alive || this.currentState !== "working") return;
          this.sprite.setTexture("boy-sit-laptop");
          scheduleTypingPause();
        });
      });
    };
    scheduleTypingPause();

    const duration = Phaser.Math.Between(WORKING_TOTAL_MIN_MS, WORKING_TOTAL_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterStretching(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-stretch");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -STRETCH_PX,
      duration: STRETCH_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
    });

    this.trackedDelay(STRETCH_TOTAL_MS, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterDrinkingCoffee(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-coffee-1");

    let sipping = true;
    this.talkTimer = this.scene.time.addEvent({
      delay: COFFEE_SIP_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive || this.currentState !== "drinkingCoffee") return;
        sipping = !sipping;
        this.sprite.setTexture(sipping ? "boy-coffee-1" : "boy-coffee-2");
      },
    });

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(COFFEE_MIN_MS, COFFEE_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterExercising(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-exercise-1");

    let frame = true;
    this.talkTimer = this.scene.time.addEvent({
      delay: EXERCISE_FRAME_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!this.alive || this.currentState !== "exercising") return;
        frame = !frame;
        this.sprite.setTexture(frame ? "boy-exercise-1" : "boy-exercise-2");
      },
    });

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -EXERCISE_BOUNCE_PX,
      duration: EXERCISE_BOUNCE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(EXERCISE_MIN_MS, EXERCISE_MAX_MS);
    this.trackedDelay(duration, () => {
      if (!this.alive) return;
      this.exitCurrentState();
      this.currentState = "idle";
      this.enterIdle();
    });
  }

  private enterDancing(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.setTexture("boy-dance-1");

    let frame = 0;
    const frames: readonly TextureKey[] = ["boy-dance-1", "boy-dance-2"];
    this.talkTimer = this.scene.time.addEvent({
      delay: SWAY_DANCE_DURATION_MS,
      loop: true,
      callback: () => {
        if (!this.alive || this.currentState !== "dancing") return;
        frame = (frame + 1) % frames.length;
        this.sprite.setTexture(frames[frame]);
      },
    });

    this.swayTween = this.scene.tweens.add({
      targets: this.sprite,
      x: SWAY_DANCE_PX,
      duration: SWAY_DANCE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -DANCE_BOUNCE_PX,
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
    this.sprite.y = 0;
    this.sprite.setTexture("boy-meditate");

    this.bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_MEDITATION_DURATION_MS,
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

  // -----------------------------------------------------------------------
  // Compacting state — squish paper & throw off-screen
  // -----------------------------------------------------------------------

  private enterCompacting(): void {
    if (!this.alive) return;
    this.sprite.y = 0;
    this.sprite.x = 0;
    this.sprite.setFlipX(false);

    this.sprite.setTexture("boy-paper-hold");

    this.trackedDelay(COMPACT_HOLD_MS, () => {
      if (!this.alive || this.currentState !== "compacting") return;

      this.sprite.setTexture("boy-paper-squish");
      this.bobTween = this.scene.tweens.add({
        targets: this.sprite,
        y: COMPACT_SQUISH_BOB_PX,
        duration: COMPACT_SQUISH_BOB_DURATION_MS,
        ease: "Quad.easeIn",
        yoyo: true,
        repeat: 1,
      });

      this.trackedDelay(COMPACT_SQUISH_MS, () => {
        if (!this.alive || this.currentState !== "compacting") return;

        this.sprite.setTexture("boy-paper-throw");

        const scale = this.sprite.scaleX;
        const handX = COMPACT_HAND_X_RATIO * scale;
        const handY = -this.sprite.displayHeight * COMPACT_HAND_Y_RATIO;

        this.paperBall = this.scene.add.image(handX, handY, "boy-paper-ball");
        this.paperBall.setScale(scale * COMPACT_PAPER_SCALE_RATIO);
        this.add(this.paperBall);

        const canvasW = this.scene.scale.width;
        const targetX = canvasW + COMPACT_OFFSCREEN_MARGIN - this.x;

        this.paperBallTween = this.scene.tweens.add({
          targets: this.paperBall,
          x: targetX,
          y: handY - COMPACT_ARC_PX,
          duration: COMPACT_FLIGHT_DURATION_MS,
          ease: "Quad.easeOut",
          onUpdate: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Image) => {
            target.angle += COMPACT_ROTATION_PER_FRAME;
          },
          onComplete: () => {
            if (!this.alive) return;
            this.cleanupPaperBall();

            this.trackedDelay(COMPACT_POST_THROW_MS, () => {
              if (!this.alive) return;
              this.exitCurrentState();
              this.currentState = "thinking";
              this.enterThinking();
            });
          },
        });

        this.scene.tweens.add({
          targets: this.paperBall,
          y: handY + COMPACT_GRAVITY_PULL_PX,
          duration: COMPACT_FLIGHT_DURATION_MS,
          ease: "Quad.easeIn",
          delay: COMPACT_GRAVITY_DELAY_MS,
        });
      });
    });
  }

  private cleanupPaperBall(): void {
    if (this.paperBallTween) {
      this.paperBallTween.stop();
      this.paperBallTween = null;
    }
    if (this.paperBall) {
      this.paperBall.destroy();
      this.paperBall = null;
    }
  }

  // -----------------------------------------------------------------------
  // State exit / cleanup
  // -----------------------------------------------------------------------

  private exitCurrentState(): void {
    if (this.bobTween) {
      this.bobTween.stop();
      this.bobTween = null;
    }

    if (this.walkTween) {
      this.walkTween.stop();
      this.walkTween = null;
    }

    if (this.bounceTween) {
      this.bounceTween.stop();
      this.bounceTween = null;
    }

    if (this.swayTween) {
      this.swayTween.stop();
      this.swayTween = null;
    }

    this.stopWalkFrameTimer();

    if (this.blinkTimer) {
      this.blinkTimer.destroy();
      this.blinkTimer = null;
    }

    if (this.talkTimer) {
      this.talkTimer.destroy();
      this.talkTimer = null;
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

    if (this.jumpTween) {
      this.jumpTween.stop();
      this.jumpTween = null;
    }

    if (this.zzzTween) {
      this.zzzTween.stop();
      this.zzzTween = null;
    }
    if (this.zzzText) {
      this.zzzText.destroy();
      this.zzzText = null;
    }

    this.cleanupPaperBall();

    if (this.dotsTimer) {
      this.dotsTimer.destroy();
      this.dotsTimer = null;
    }

    for (const dot of this.thinkingDots) {
      if (!dot.scene) continue;
      dot.setAlpha(0);
    }

    if (this.sprite?.scene) {
      this.sprite.y = 0;
      this.sprite.x = 0;
      this.sprite.setFlipX(false);
    }

    this.cancelPendingDelays();
  }

  // -----------------------------------------------------------------------
  // Timer helpers
  // -----------------------------------------------------------------------

  private scheduleBlink(): void {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(BLINK_MIN_MS, BLINK_MAX_MS);
    this.blinkTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return;

        this.sprite.setTexture("boy-idle-2");
        this.trackedDelay(BLINK_DURATION_MS, () => {
          if (!this.alive) return;
          if (this.currentState === "idle") {
            this.sprite.setTexture("boy-idle-1");
          }
          this.scheduleBlink();
        });
      },
    });
  }

  private scheduleActivity(): void {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(ACTIVITY_MIN_DELAY_MS, ACTIVITY_MAX_DELAY_MS);
    this.activityTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return;

        if (this.activityCount >= ACTIVITY_SETTLE_THRESHOLD) {
          this.exitCurrentState();
          this.currentState = "sitting";
          this.enterSitting();
          return;
        }
        this.activityCount++;

        const roll = Math.random();

        if (roll < ACTIVITY_WEIGHTS.WANDER) {
          const targetX = Phaser.Math.Between(this.minX, this.maxX);
          this.walkTo(targetX);
        } else if (roll < ACTIVITY_WEIGHTS.YAWN) {
          this.exitCurrentState();
          this.currentState = "yawning";
          this.enterYawning();
        } else if (roll < ACTIVITY_WEIGHTS.PHONE) {
          this.exitCurrentState();
          this.currentState = "phoneChecking";
          this.enterPhoneChecking();
        } else if (roll < ACTIVITY_WEIGHTS.READ) {
          const targetX = Phaser.Math.Between(this.minX, this.maxX);
          this.walkTo(targetX, () => {
            this.exitCurrentState();
            this.currentState = "reading";
            this.enterReading();
          });
        } else if (roll < ACTIVITY_WEIGHTS.WORK) {
          const targetX = Phaser.Math.Between(this.minX, this.maxX);
          this.walkTo(targetX, () => {
            this.exitCurrentState();
            this.currentState = "working";
            this.enterWorking();
          });
        } else if (roll < ACTIVITY_WEIGHTS.STRETCH) {
          this.exitCurrentState();
          this.currentState = "stretching";
          this.enterStretching();
        } else if (roll < ACTIVITY_WEIGHTS.COFFEE) {
          this.exitCurrentState();
          this.currentState = "drinkingCoffee";
          this.enterDrinkingCoffee();
        } else if (roll < ACTIVITY_WEIGHTS.EXERCISE) {
          this.exitCurrentState();
          this.currentState = "exercising";
          this.enterExercising();
        } else if (roll < ACTIVITY_WEIGHTS.DANCE) {
          this.exitCurrentState();
          this.currentState = "dancing";
          this.enterDancing();
        } else {
          this.exitCurrentState();
          this.currentState = "meditating";
          this.enterMeditating();
        }
      },
    });
  }

  private scheduleLookAround(): void {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(LOOK_AROUND_MIN_MS, LOOK_AROUND_MAX_MS);
    this.lookTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        if (!this.alive || this.currentState !== "idle") return;
        this.sprite.setTexture("boy-idle-look");
        this.trackedDelay(LOOK_GLANCE_MS, () => {
          if (!this.alive || this.currentState !== "idle") return;
          this.sprite.setTexture("boy-idle-1");
          this.trackedDelay(LOOK_PAUSE_MS, () => {
            if (!this.alive || this.currentState !== "idle") return;
            this.sprite.setTexture("boy-idle-look");
            this.trackedDelay(LOOK_GLANCE_MS, () => {
              if (!this.alive || this.currentState !== "idle") return;
              this.sprite.setTexture("boy-idle-1");
              this.scheduleLookAround();
            });
          });
        });
      },
    });
  }

  private stopWalkFrameTimer(): void {
    if (this.walkFrameTimer) {
      this.walkFrameTimer.destroy();
      this.walkFrameTimer = null;
    }
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
    for (const timer of this.pendingDelays) {
      timer.destroy();
    }
    this.pendingDelays.length = 0;
  }
}
