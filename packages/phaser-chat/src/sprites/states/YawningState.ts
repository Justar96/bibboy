import type { StateHandler, PixelBoyContext } from "./types";
import { YAWN_STRETCH_PX, YAWN_STRETCH_DURATION_MS, YAWN_TOTAL_MS } from "../pixel-boy-constants";

export class YawningState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-yawn");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -YAWN_STRETCH_PX,
      duration: YAWN_STRETCH_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
    });

    ctx.tweens.delay(YAWN_TOTAL_MS, () => {
      if (!ctx.alive) return;
      ctx.transitionTo("idle");
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
