import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import { BOB_IDLE_PX, BOB_MEDITATION_DURATION_MS, MEDITATE_MIN_MS, MEDITATE_MAX_MS } from "../pixel-boy-constants";

export class MeditatingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-meditate");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_MEDITATION_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(MEDITATE_MIN_MS, MEDITATE_MAX_MS);
    ctx.tweens.delay(duration, () => {
      if (!ctx.alive) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
