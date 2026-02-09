import type { StateHandler, PixelBoyContext } from "./types";
import { STRETCH_PX, STRETCH_DURATION_MS, STRETCH_TOTAL_MS } from "../pixel-boy-constants";

export class StretchingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-stretch");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -STRETCH_PX,
      duration: STRETCH_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
    });

    ctx.tweens.delay(STRETCH_TOTAL_MS, () => {
      if (!ctx.alive) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
