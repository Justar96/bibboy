import type { StateHandler, PixelBoyContext } from "./types";
import {
  SWAY_THINKING_PX,
  SWAY_THINKING_DURATION_MS,
  THINKING_DOT_INTERVAL_MS,
  THINKING_DOT_COUNT,
} from "../pixel-boy-constants";

export class ThinkingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.x = 0;
    ctx.sprite.setFlipX(false);
    ctx.sprite.setTexture("boy-think");

    ctx.tweens.addTween("sway", {
      targets: ctx.sprite,
      x: SWAY_THINKING_PX,
      duration: SWAY_THINKING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    let dotIndex = 0;
    ctx.tweens.addTimer("dots", {
      delay: THINKING_DOT_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (!ctx.alive) return;
        if (dotIndex < THINKING_DOT_COUNT) {
          ctx.thinkingDots[dotIndex].setAlpha(1);
          dotIndex++;
        } else {
          for (const dot of ctx.thinkingDots) dot.setAlpha(0);
          dotIndex = 0;
        }
      },
    });
  }

  exit(ctx: PixelBoyContext): void {
    for (const dot of ctx.thinkingDots) {
      if (!dot.scene) continue;
      dot.setAlpha(0);
    }
  }
}
