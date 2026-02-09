import type { StateHandler, PixelBoyContext } from "./types";
import {
  BOB_IDLE_PX,
  BOB_SLOW_BREATHING_DURATION_MS,
  SLEEP_ZZZ_OFFSET_X,
  SLEEP_ZZZ_FONT_SIZE,
  SLEEP_ZZZ_FLOAT_PX,
  SLEEP_ZZZ_FLOAT_DURATION_MS,
  SLEEP_ZZZ_PAUSE_MS,
} from "../pixel-boy-constants";

export class SleepingState implements StateHandler {
  private zzzText: Phaser.GameObjects.Text | null = null;

  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-idle-2");

    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: -BOB_IDLE_PX,
      duration: BOB_SLOW_BREATHING_DURATION_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.zzzText = ctx.scene.add.text(
      SLEEP_ZZZ_OFFSET_X,
      -ctx.sprite.displayHeight - SLEEP_ZZZ_OFFSET_X,
      "z",
      { fontSize: SLEEP_ZZZ_FONT_SIZE, color: "#BBBBBB", fontFamily: "monospace" },
    );
    ctx.addToContainer(this.zzzText);

    const animateZ = (): void => {
      if (!ctx.alive || !this.zzzText) return;
      this.zzzText.setPosition(
        SLEEP_ZZZ_OFFSET_X,
        -ctx.sprite.displayHeight - SLEEP_ZZZ_OFFSET_X,
      );
      this.zzzText.setAlpha(0.7);

      ctx.tweens.addTween("zzz", {
        targets: this.zzzText,
        y: this.zzzText.y - SLEEP_ZZZ_FLOAT_PX,
        alpha: 0,
        duration: SLEEP_ZZZ_FLOAT_DURATION_MS,
        ease: "Sine.easeOut",
        onComplete: () => {
          if (!ctx.alive) return;
          ctx.tweens.delay(SLEEP_ZZZ_PAUSE_MS, animateZ);
        },
      });
    };
    animateZ();
  }

  exit(ctx: PixelBoyContext): void {
    if (this.zzzText) {
      ctx.removeFromContainer(this.zzzText);
      this.zzzText.destroy();
      this.zzzText = null;
    }
  }
}
