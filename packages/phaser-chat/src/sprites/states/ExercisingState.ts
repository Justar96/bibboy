import * as Phaser from "phaser";
import type { StateHandler, PixelBoyContext } from "./types";
import {
  EXERCISE_FRAME_INTERVAL_MS,
  EXERCISE_BOUNCE_PX,
  EXERCISE_BOUNCE_DURATION_MS,
  EXERCISE_MIN_MS,
  EXERCISE_MAX_MS,
} from "../pixel-boy-constants";

export class ExercisingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-exercise-1");

    let frame = true;
    ctx.tweens.addTimer("exercise", {
      delay: EXERCISE_FRAME_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!ctx.alive) return;
        frame = !frame;
        ctx.sprite.setTexture(frame ? "boy-exercise-1" : "boy-exercise-2");
      },
    });

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -EXERCISE_BOUNCE_PX,
      duration: EXERCISE_BOUNCE_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    const duration = Phaser.Math.Between(EXERCISE_MIN_MS, EXERCISE_MAX_MS);
    ctx.tweens.delay(duration, () => {
      if (!ctx.alive) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
