import type * as Phaser from "phaser";
import type { TweenManager } from "../TweenManager";
import type { TextureKey } from "../sprite-frames";

/**
 * Shared context passed to every state handler.
 * Avoids coupling handlers to the full PixelBoy class.
 */
export interface PixelBoyContext {
  readonly scene: Phaser.Scene;
  readonly sprite: Phaser.GameObjects.Image;
  readonly tweens: TweenManager;
  readonly thinkingDots: readonly Phaser.GameObjects.Arc[];
  readonly container: Phaser.GameObjects.Container;

  readonly minX: number;
  readonly maxX: number;

  alive: boolean;

  // State transitions — handlers call these to switch states
  transitionTo(state: string): void;
  walkTo(targetX: number, onComplete?: () => void): void;

  // Helpers for game objects that need container management
  addToContainer(obj: Phaser.GameObjects.GameObject): void;
  removeFromContainer(obj: Phaser.GameObjects.GameObject): void;
}

/**
 * Interface for a character state handler.
 *
 * Each state encapsulates its own enter/exit logic, keeping PixelBoy
 * as a thin orchestrator.
 */
export interface StateHandler {
  enter(ctx: PixelBoyContext): void;
  exit(ctx: PixelBoyContext): void;
}
