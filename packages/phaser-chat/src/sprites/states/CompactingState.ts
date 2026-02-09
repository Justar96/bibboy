import type { StateHandler, PixelBoyContext } from "./types";
import {
  COMPACT_HOLD_MS,
  COMPACT_SQUISH_BOB_PX,
  COMPACT_SQUISH_BOB_DURATION_MS,
  COMPACT_SQUISH_MS,
  COMPACT_PAPER_SCALE_RATIO,
  COMPACT_HAND_X_RATIO,
  COMPACT_HAND_Y_RATIO,
  COMPACT_ARC_PX,
  COMPACT_FLIGHT_DURATION_MS,
  COMPACT_GRAVITY_PULL_PX,
  COMPACT_GRAVITY_DELAY_MS,
  COMPACT_ROTATION_PER_FRAME,
  COMPACT_OFFSCREEN_MARGIN,
  COMPACT_POST_THROW_MS,
} from "../pixel-boy-constants";

export class CompactingState implements StateHandler {
  private paperBall: Phaser.GameObjects.Image | null = null;
  private active = false;

  enter(ctx: PixelBoyContext): void {
    if (!ctx.alive) return;
    this.active = true;
    ctx.sprite.y = 0;
    ctx.sprite.x = 0;
    ctx.sprite.setFlipX(false);
    ctx.sprite.setTexture("boy-paper-hold");

    ctx.tweens.delay(COMPACT_HOLD_MS, () => {
      if (!ctx.alive || !this.active) return;
      this.startSquish(ctx);
    });
  }

  exit(ctx: PixelBoyContext): void {
    this.active = false;
    this.cleanupPaperBall(ctx);
  }

  private startSquish(ctx: PixelBoyContext): void {
    ctx.sprite.setTexture("boy-paper-squish");
    ctx.tweens.addTween("bob", {
      targets: ctx.sprite,
      y: COMPACT_SQUISH_BOB_PX,
      duration: COMPACT_SQUISH_BOB_DURATION_MS,
      ease: "Quad.easeIn",
      yoyo: true,
      repeat: 1,
    });

    ctx.tweens.delay(COMPACT_SQUISH_MS, () => {
      if (!ctx.alive || !this.active) return;
      this.startThrow(ctx);
    });
  }

  private startThrow(ctx: PixelBoyContext): void {
    ctx.sprite.setTexture("boy-paper-throw");

    const scale = ctx.sprite.scaleX;
    const handX = COMPACT_HAND_X_RATIO * scale;
    const handY = -ctx.sprite.displayHeight * COMPACT_HAND_Y_RATIO;

    this.paperBall = ctx.scene.add.image(handX, handY, "boy-paper-ball");
    this.paperBall.setScale(scale * COMPACT_PAPER_SCALE_RATIO);
    ctx.addToContainer(this.paperBall);

    const canvasW = ctx.scene.scale.width;
    const targetX = canvasW + COMPACT_OFFSCREEN_MARGIN - ctx.container.x;

    ctx.tweens.addTween("paperFlight", {
      targets: this.paperBall,
      x: targetX,
      y: handY - COMPACT_ARC_PX,
      duration: COMPACT_FLIGHT_DURATION_MS,
      ease: "Quad.easeOut",
      onUpdate: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Image) => {
        target.angle += COMPACT_ROTATION_PER_FRAME;
      },
      onComplete: () => {
        if (!ctx.alive) return;
        this.cleanupPaperBall(ctx);
        ctx.tweens.delay(COMPACT_POST_THROW_MS, () => {
          if (!ctx.alive) return;
          ctx.transitionTo("thinking");
        });
      },
    });

    // Gravity pull — second tween on the same target
    ctx.scene.tweens.add({
      targets: this.paperBall,
      y: handY + COMPACT_GRAVITY_PULL_PX,
      duration: COMPACT_FLIGHT_DURATION_MS,
      ease: "Quad.easeIn",
      delay: COMPACT_GRAVITY_DELAY_MS,
    });
  }

  private cleanupPaperBall(ctx: PixelBoyContext): void {
    ctx.tweens.stopTween("paperFlight");
    if (this.paperBall) {
      ctx.removeFromContainer(this.paperBall);
      this.paperBall.destroy();
      this.paperBall = null;
    }
  }
}
