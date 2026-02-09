import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import {
  BOB_IDLE_PX,
  BOB_TYPING_DURATION_MS,
  WORKING_PAUSE_MIN_MS,
  WORKING_PAUSE_MAX_MS,
  WORKING_LOOK_UP_MS,
  WORKING_TOTAL_MIN_MS,
  WORKING_TOTAL_MAX_MS,
} from "../pixel-boy-constants";

export class WorkingState implements StateHandler {
  private active = false;

  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    this.active = true;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-sit-laptop");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_TYPING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.scheduleTypingPause(ctx);

    const duration = Phaser.Math.Between(WORKING_TOTAL_MIN_MS, WORKING_TOTAL_MAX_MS);
    ctx.tweens.delay(duration, () => {
      if (!ctx.alive || !this.active) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {
    this.active = false;
  }

  private scheduleTypingPause(ctx: PixelBoyContext): void {
    if (!ctx.alive || !this.active) return;
    const delay = Phaser.Math.Between(WORKING_PAUSE_MIN_MS, WORKING_PAUSE_MAX_MS);
    ctx.tweens.delay(delay, () => {
      if (!ctx.alive || !this.active) return;
      ctx.sprite.setTexture("boy-sit");
      ctx.tweens.delay(WORKING_LOOK_UP_MS, () => {
        if (!ctx.alive || !this.active) return;
        ctx.sprite.setTexture("boy-sit-laptop");
        this.scheduleTypingPause(ctx);
      });
    });
  }
}
