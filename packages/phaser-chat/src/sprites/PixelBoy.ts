import * as Phaser from "phaser";
import type { CharacterState } from "@bibboy/shared";
import { PALETTE, TEXTURE_MAP } from "./sprite-frames";
import { TweenManager } from "./TweenManager";
import type { StateHandler, PixelBoyContext } from "./states/types";
import { IdleState } from "./states/IdleState";
import { ThinkingState } from "./states/ThinkingState";
import { TalkingState } from "./states/TalkingState";
import { SittingState } from "./states/SittingState";
import { SleepingState } from "./states/SleepingState";
import { CompactingState } from "./states/CompactingState";
import { YawningState } from "./states/YawningState";
import { PhoneCheckingState } from "./states/PhoneCheckingState";
import { ReadingState } from "./states/ReadingState";
import { WorkingState } from "./states/WorkingState";
import { StretchingState } from "./states/StretchingState";
import { DrinkingCoffeeState } from "./states/DrinkingCoffeeState";
import { ExercisingState } from "./states/ExercisingState";
import { MeditatingState } from "./states/MeditatingState";
import {
  THINKING_DOT_COLOR,
  THINKING_DOT_RADIUS,
  THINKING_DOT_SPACING,
  THINKING_DOT_COUNT,
  THINKING_DOT_OFFSET_Y,
  BOUNCE_OFFSET,
  BOUNCE_DURATION_MS,
  WALK_LEAN_PX,
  WALK_LEAN_DURATION_MS,
  WALK_STEP_HALF_MS,
  WALK_BOB_PX,
  WALK_SPEED,
  SPRINT_SPEED,
  ACCELERATION,
  DRAG,
  STOP_THRESHOLD,
} from "./pixel-boy-constants";

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
// State handler registry
// ---------------------------------------------------------------------------

const idleState = new IdleState();

const STATE_HANDLERS: Record<string, StateHandler> = {
  idle: idleState,
  thinking: new ThinkingState(),
  talking: new TalkingState(),
  sitting: new SittingState(),
  sleeping: new SleepingState(),
  compacting: new CompactingState(),
  yawning: new YawningState(),
  phoneChecking: new PhoneCheckingState(),
  reading: new ReadingState(),
  working: new WorkingState(),
  stretching: new StretchingState(),
  drinkingCoffee: new DrinkingCoffeeState(),
  exercising: new ExercisingState(),
  meditating: new MeditatingState(),
};

// ---------------------------------------------------------------------------
// PixelBoy — thin orchestrator using the State pattern
// ---------------------------------------------------------------------------

export class PixelBoy extends Phaser.GameObjects.Container {
  private readonly _sprite: Phaser.GameObjects.Image;
  private readonly _thinkingDots: readonly Phaser.GameObjects.Arc[];
  private readonly _tweens: TweenManager;

  private currentState: CharacterState = "idle";
  private currentHandler: StateHandler | null = null;
  private _minX = 0;
  private _maxX = 800;
  private isDestroyed = false;

  // Walk animation frame toggle
  private walkFrame = false;
  private walkAnimAccumulator = 0;

  // Movement state (physics-based walking)
  private targetX: number | null = null;
  private onReachTarget: (() => void) | null = null;

  // Context object shared with state handlers
  private readonly ctx: PixelBoyContext;

  get alive(): boolean {
    return !this.isDestroyed && !!this.scene?.sys;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, scale = 5) {
    super(scene, x, y);

    // Generate all textures once
    for (const [key, data] of Object.entries(TEXTURE_MAP)) {
      generateTexture(scene, key, data);
    }

    this._sprite = scene.add.image(0, 0, "boy-idle-1");
    this._sprite.setScale(scale);
    this._sprite.setOrigin(0.5, 1);
    this.add(this._sprite);

    // Create thinking dots (hidden by default)
    const dots: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < THINKING_DOT_COUNT; i++) {
      const dot = scene.add.circle(
        -THINKING_DOT_SPACING + i * THINKING_DOT_SPACING,
        -this._sprite.displayHeight - THINKING_DOT_OFFSET_Y,
        THINKING_DOT_RADIUS,
        THINKING_DOT_COLOR,
      );
      dot.setAlpha(0);
      dots.push(dot);
      this.add(dot);
    }
    this._thinkingDots = dots;

    this._tweens = new TweenManager(scene);

    // Build the context object that state handlers use
    this.ctx = {
      scene,
      sprite: this._sprite,
      tweens: this._tweens,
      thinkingDots: this._thinkingDots,
      container: this,
      get minX() { return self._minX; },
      get maxX() { return self._maxX; },
      alive: true,
      transitionTo: (state: string) => this.setCharacterState(state as CharacterState),
      walkTo: (tx: number, onComplete?: () => void) => this.walkTo(tx, onComplete),
      addToContainer: (obj: Phaser.GameObjects.GameObject) => this.add(obj),
      removeFromContainer: (obj: Phaser.GameObjects.GameObject) => this.remove(obj),
    };
    const self = this;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setDragX(DRAG);
    body.setCollideWorldBounds(true);

    this.enterState("idle");
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  public setCharacterState(state: CharacterState): void {
    if (!this.alive) return;
    if (this.currentState === state) return;

    // "walking" set directly just idles — use walkTo() for actual walking
    const resolvedState = state === "walking" ? "idle" : state;
    this.exitCurrentState();
    this.enterState(resolvedState);
  }

  walkTo(targetX: number, onComplete?: () => void): void {
    if (!this.alive) return;
    this.exitCurrentState();
    this.currentState = "walking";
    this.targetX = targetX;
    this.onReachTarget = onComplete || null;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setDragX(0);
    body.setAccelerationX(0);

    this._sprite.y = 0;
    this._sprite.setTexture("boy-walk-1");

    const direction = targetX > this.x ? 1 : -1;
    this._tweens.addTween("sway", {
      targets: this._sprite,
      x: direction * WALK_LEAN_PX,
      duration: WALK_LEAN_DURATION_MS,
      ease: "Sine.easeOut",
    });

    this._tweens.addTween("bob", {
      targets: this._sprite,
      y: -WALK_BOB_PX,
      duration: WALK_STEP_HALF_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  bounce(): void {
    if (!this.alive) return;
    this._tweens.addTween("bounce", {
      targets: this._sprite,
      y: this._sprite.y - BOUNCE_OFFSET,
      duration: BOUNCE_DURATION_MS,
      ease: "Quad.easeOut",
      yoyo: true,
    });
  }

  setBounds(minX: number, maxX: number): void {
    this._minX = minX;
    this._maxX = maxX;
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
  // Update loop — physics-based movement
  // -----------------------------------------------------------------------

  update(_time: number, delta: number): void {
    if (!this.alive) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    if (this.targetX !== null) {
      const dist = this.targetX - this.x;
      const absDist = Math.abs(dist);

      if (absDist < STOP_THRESHOLD) {
        body.setVelocityX(0);
        this.x = this.targetX;
        this.targetX = null;

        if (this.onReachTarget) {
          const callback = this.onReachTarget;
          this.onReachTarget = null;
          callback();
        } else {
          this.exitCurrentState();
          this.enterState("idle");
        }
      } else {
        const direction = Math.sign(dist);
        const speed = absDist > 200 ? SPRINT_SPEED : WALK_SPEED;

        if (body.velocity.x * direction < speed) {
          body.setAccelerationX(direction * ACCELERATION);
        } else {
          body.setAccelerationX(0);
          body.setVelocityX(direction * speed);
        }

        this._sprite.setFlipX(direction < 0);
        this.updateWalkAnimation(Math.abs(body.velocity.x), delta);
      }
    } else {
      body.setAccelerationX(0);
      body.setDragX(DRAG * 2000);
    }
  }

  // -----------------------------------------------------------------------
  // State machine internals
  // -----------------------------------------------------------------------

  private enterState(state: string): void {
    this.currentState = state as CharacterState;
    const handler = STATE_HANDLERS[state];
    if (!handler) return;

    this.currentHandler = handler;
    this.ctx.alive = this.alive;
    handler.enter(this.ctx);
  }

  private exitCurrentState(): void {
    if (this.currentHandler) {
      this.ctx.alive = this.alive;
      this.currentHandler.exit(this.ctx);
      this.currentHandler = null;
    }

    this._tweens.stopAll();

    if (this._sprite?.scene) {
      this._sprite.y = 0;
      this._sprite.x = 0;
      this._sprite.setFlipX(false);
    }
  }

  private updateWalkAnimation(speed: number, delta: number): void {
    if (speed < 10) return;
    const msPerFrame = Math.max(80, 200 - (speed - 80) * 0.8);
    this.walkAnimAccumulator += delta;

    if (this.walkAnimAccumulator >= msPerFrame) {
      this.walkAnimAccumulator -= msPerFrame;
      this.walkFrame = !this.walkFrame;
      this._sprite.setTexture(this.walkFrame ? "boy-walk-2" : "boy-walk-1");
    }
  }
}
