import type { StateHandler, PixelBoyContext } from "./types";
import { BOB_IDLE_PX, BOB_BREATHING_DURATION_MS, SITTING_SLEEP_DELAY_MS } from "../pixel-boy-constants";

export class SittingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-sit");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    ctx.tweens.addTimer("sleep", {
      delay: SITTING_SLEEP_DELAY_MS,
      callback: () => {
        if (!ctx.alive) return;
        ctx.transitionTo("sleeping");
      },
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
