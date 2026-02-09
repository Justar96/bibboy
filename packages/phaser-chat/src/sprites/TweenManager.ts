import * as Phaser from "phaser";

/**
 * Centralized manager for tweens and timers on a Phaser game object.
 *
 * Eliminates the need for dozens of nullable tween/timer fields and
 * repetitive null-check cleanup code. Each tween or timer is stored
 * under a string key; calling `addTween`/`addTimer` with the same key
 * automatically stops the previous one.
 */
export class TweenManager {
  private readonly tweens = new Map<string, Phaser.Tweens.Tween>();
  private readonly timers = new Map<string, Phaser.Time.TimerEvent>();
  private readonly pendingDelays: Phaser.Time.TimerEvent[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  // -----------------------------------------------------------------------
  // Tweens
  // -----------------------------------------------------------------------

  addTween(key: string, config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    this.stopTween(key);
    const tween = this.scene.tweens.add(config);
    this.tweens.set(key, tween);
    return tween;
  }

  stopTween(key: string): void {
    const existing = this.tweens.get(key);
    if (existing) {
      existing.stop();
      this.tweens.delete(key);
    }
  }

  // -----------------------------------------------------------------------
  // Timers (looping / one-shot via scene.time.addEvent)
  // -----------------------------------------------------------------------

  addTimer(key: string, config: Phaser.Types.Time.TimerEventConfig): Phaser.Time.TimerEvent {
    this.stopTimer(key);
    const timer = this.scene.time.addEvent(config);
    this.timers.set(key, timer);
    return timer;
  }

  stopTimer(key: string): void {
    const existing = this.timers.get(key);
    if (existing) {
      existing.destroy();
      this.timers.delete(key);
    }
  }

  // -----------------------------------------------------------------------
  // Tracked delayed calls — auto-cancelled on cleanup
  // -----------------------------------------------------------------------

  delay(ms: number, callback: () => void): Phaser.Time.TimerEvent {
    const timer = this.scene.time.delayedCall(ms, () => {
      const idx = this.pendingDelays.indexOf(timer);
      if (idx !== -1) this.pendingDelays.splice(idx, 1);
      callback();
    });
    this.pendingDelays.push(timer);
    return timer;
  }

  // -----------------------------------------------------------------------
  // Bulk cleanup
  // -----------------------------------------------------------------------

  stopAll(): void {
    for (const tween of this.tweens.values()) tween.stop();
    this.tweens.clear();

    for (const timer of this.timers.values()) timer.destroy();
    this.timers.clear();

    for (const d of this.pendingDelays) d.destroy();
    this.pendingDelays.length = 0;
  }
}
