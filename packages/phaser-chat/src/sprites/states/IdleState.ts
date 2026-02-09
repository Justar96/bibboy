import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import {
  BOB_IDLE_PX,
  BOB_IDLE_DURATION_MS,
  BLINK_MIN_MS,
  BLINK_MAX_MS,
  BLINK_DURATION_MS,
  LOOK_AROUND_MIN_MS,
  LOOK_AROUND_MAX_MS,
  LOOK_GLANCE_MS,
  LOOK_PAUSE_MS,
  ACTIVITY_MIN_DELAY_MS,
  ACTIVITY_MAX_DELAY_MS,
  ACTIVITY_SETTLE_THRESHOLD,
  ACTIVITY_WEIGHTS,
} from "../pixel-boy-constants";

export class IdleState implements StateHandler {
  private activityCount = 0;

  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-idle-1");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: ctx.sprite.y - BOB_IDLE_PX,
      duration: BOB_IDLE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.scheduleBlink(ctx);
    this.scheduleLookAround(ctx);
    this.scheduleActivity(ctx);
  }

  exit(_ctx: PixelBoyContext): void {
    // TweenManager.stopAll() handles cleanup
  }

  resetActivityCount(): void {
    this.activityCount = 0;
  }

  // -----------------------------------------------------------------------
  // Idle micro-animations
  // -----------------------------------------------------------------------

  private scheduleBlink(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    const delay = Phaser.Math.Between(BLINK_MIN_MS, BLINK_MAX_MS);
    ctx.tweens.addTimer("blink", {
      delay,
      callback: () => {
        if (!ctx.alive) return;
        ctx.sprite.setTexture("boy-idle-2");
        ctx.tweens.delay(BLINK_DURATION_MS, () => {
          if (!ctx.alive) return;
          ctx.sprite.setTexture("boy-idle-1");
          this.scheduleBlink(ctx);
        });
      },
    });
  }

  private scheduleLookAround(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    const delay = Phaser.Math.Between(LOOK_AROUND_MIN_MS, LOOK_AROUND_MAX_MS);
    ctx.tweens.addTimer("look", {
      delay,
      callback: () => {
        if (!ctx.alive) return;
        ctx.sprite.setTexture("boy-idle-look");
        ctx.tweens.delay(LOOK_GLANCE_MS, () => {
          if (!ctx.alive) return;
          ctx.sprite.setTexture("boy-idle-1");
          ctx.tweens.delay(LOOK_PAUSE_MS, () => {
            if (!ctx.alive) return;
            ctx.sprite.setTexture("boy-idle-look");
            ctx.tweens.delay(LOOK_GLANCE_MS, () => {
              if (!ctx.alive) return;
              ctx.sprite.setTexture("boy-idle-1");
              this.scheduleLookAround(ctx);
            });
          });
        });
      },
    });
  }

  private scheduleActivity(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    const delay = Phaser.Math.Between(ACTIVITY_MIN_DELAY_MS, ACTIVITY_MAX_DELAY_MS);
    ctx.tweens.addTimer("activity", {
      delay,
      callback: () => {
        if (!ctx.alive) return;

        if (this.activityCount >= ACTIVITY_SETTLE_THRESHOLD) {
          ctx.transitionTo("sitting");
          return;
        }
        this.activityCount++;

        const roll = Math.random();

        if (roll < ACTIVITY_WEIGHTS.WANDER) {
          const targetX = Phaser.Math.Between(ctx.minX, ctx.maxX);
          ctx.walkTo(targetX);
        } else if (roll < ACTIVITY_WEIGHTS.YAWN) {
          ctx.transitionTo("yawning");
        } else if (roll < ACTIVITY_WEIGHTS.PHONE) {
          ctx.transitionTo("phoneChecking");
        } else if (roll < ACTIVITY_WEIGHTS.READ) {
          const targetX = Phaser.Math.Between(ctx.minX, ctx.maxX);
          ctx.walkTo(targetX, () => ctx.transitionTo("reading"));
        } else if (roll < ACTIVITY_WEIGHTS.WORK) {
          const targetX = Phaser.Math.Between(ctx.minX, ctx.maxX);
          ctx.walkTo(targetX, () => ctx.transitionTo("working"));
        } else if (roll < ACTIVITY_WEIGHTS.STRETCH) {
          ctx.transitionTo("stretching");
        } else if (roll < ACTIVITY_WEIGHTS.COFFEE) {
          ctx.transitionTo("drinkingCoffee");
        } else if (roll < ACTIVITY_WEIGHTS.EXERCISE) {
          ctx.transitionTo("exercising");
        } else {
          ctx.transitionTo("meditating");
        }
      },
    });
  }
}
