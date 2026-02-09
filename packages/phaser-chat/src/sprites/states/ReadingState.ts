import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import {
  BOB_IDLE_PX,
  BOB_BREATHING_DURATION_MS,
  READING_PAGE_TURN_MIN_MS,
  READING_PAGE_TURN_MAX_MS,
  READING_PAGE_TURN_SWAP_MS,
  READING_TOTAL_MIN_MS,
  READING_TOTAL_MAX_MS,
} from "../pixel-boy-constants";

export class ReadingState implements StateHandler {
  private active = false;

  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    this.active = true;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-sit-read");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.schedulePageTurn(ctx);

    const duration = Phaser.Math.Between(READING_TOTAL_MIN_MS, READING_TOTAL_MAX_MS);
    ctx.tweens.delay(duration, () => {
      if (!ctx.alive || !this.active) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {
    this.active = false;
  }

  private schedulePageTurn(ctx: PixelBoyContext): void {
    if (!ctx.alive || !this.active) return;
    const delay = Phaser.Math.Between(READING_PAGE_TURN_MIN_MS, READING_PAGE_TURN_MAX_MS);
    ctx.tweens.delay(delay, () => {
      if (!ctx.alive || !this.active) return;
      ctx.sprite.setTexture("boy-sit");
      ctx.tweens.delay(READING_PAGE_TURN_SWAP_MS, () => {
        if (!ctx.alive || !this.active) return;
        ctx.sprite.setTexture("boy-sit-read");
        this.schedulePageTurn(ctx);
      });
    });
  }
}
