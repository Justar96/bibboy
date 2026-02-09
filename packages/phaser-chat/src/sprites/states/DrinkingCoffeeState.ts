import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import {
  COFFEE_SIP_INTERVAL_MS,
  BOB_IDLE_PX,
  BOB_BREATHING_DURATION_MS,
  COFFEE_MIN_MS,
  COFFEE_MAX_MS,
} from "../pixel-boy-constants";

export class DrinkingCoffeeState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-coffee-1");

    let sipping = true;
    ctx.tweens.addTimer("sip", {
      delay: COFFEE_SIP_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!ctx.alive) return;
        sipping = !sipping;
        ctx.sprite.setTexture(sipping ? "boy-coffee-1" : "boy-coffee-2");
      },
    });

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(COFFEE_MIN_MS, COFFEE_MAX_MS);
    ctx.tweens.delay(duration, () => {
      if (!ctx.alive) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
