import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import {
  SWAY_THINKING_PX,
  SWAY_PHONE_DURATION_MS,
  BOB_IDLE_PX,
  BOB_BREATHING_DURATION_MS,
  PHONE_MIN_MS,
  PHONE_MAX_MS,
} from "../pixel-boy-constants";

export class PhoneCheckingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-phone");

    ctx.tweens.addTween("sway", {
      targets: ctx.sprite,
      x: SWAY_THINKING_PX,
      duration: SWAY_PHONE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(PHONE_MIN_MS, PHONE_MAX_MS);
    ctx.tweens.delay(duration, () => {
      if (!ctx.alive) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
