import type { StateHandler, PixelBoyContext } from "./types";
import { BOUNCE_OFFSET, BOUNCE_DURATION_MS, TALK_MOUTH_TOGGLE_MS } from "../pixel-boy-constants";

export class TalkingState implements StateHandler {
  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    ctx.sprite.y = 0;
    ctx.sprite.setTexture("boy-talk");

    // Bounce on enter
    ctx.tweens.addTween("bounce", {
      targets: ctx.sprite,
      y: ctx.sprite.y - BOUNCE_OFFSET,
      duration: BOUNCE_DURATION_MS,
      ease: "Quad.easeOut",
      yoyo: true,
    });

    let mouthOpen = true;
    ctx.tweens.addTimer("talk", {
      delay: TALK_MOUTH_TOGGLE_MS,
      loop: true,
      callback: () => {
        if (!ctx.alive) return;
        mouthOpen = !mouthOpen;
        ctx.sprite.setTexture(mouthOpen ? "boy-talk" : "boy-idle-1");
      },
    });
  }

  exit(_ctx: PixelBoyContext): void {}
}
