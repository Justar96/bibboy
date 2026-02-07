import Phaser from "phaser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_WIDTH = 360;
const PADDING = 14;
const CORNER_RADIUS = 8;
const BORDER_WIDTH = 1.5;
const TRIANGLE_WIDTH = 12;
const TRIANGLE_HEIGHT = 8;
const SHADOW_OFFSET = 2;
const SHADOW_ALPHA = 0.08;
const TYPEWRITER_DELAY = 25;
const INDICATOR_BLINK_DELAY = 500;
const TOP_MARGIN = 8;
const EDGE_MARGIN = 8; // horizontal distance from canvas edges

const BG_COLOR = 0xffffff;
const BORDER_COLOR = 0x1a1a1a;
const SHADOW_COLOR = 0x000000;
const MORE_INDICATOR_CHAR = "\u25bc"; // ▼

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: "13px",
  color: "#333333",
  wordWrap: { width: MAX_WIDTH - PADDING * 2, useAdvancedWrap: true },
  lineSpacing: 5,
};

// ---------------------------------------------------------------------------
// SpeechBubble
// ---------------------------------------------------------------------------

export class SpeechBubble extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;
  private textObject: Phaser.GameObjects.Text;
  private indicator: Phaser.GameObjects.Text;

  private typewriterTimer: Phaser.Time.TimerEvent | null = null;
  private indicatorBlinkTimer: Phaser.Time.TimerEvent | null = null;
  private showTween: Phaser.Tweens.Tween | null = null;
  private hideTween: Phaser.Tweens.Tween | null = null;

  private fullText = "";
  private visibleCharCount = 0;
  private _typewriterDone = false;
  private _hasMore = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Shadow + bubble graphics
    this.graphics = scene.add.graphics();
    this.add(this.graphics);

    // Text content
    this.textObject = scene.add.text(0, 0, "", TEXT_STYLE);
    this.textObject.setOrigin(0, 0);
    this.add(this.textObject);

    // Chunk navigation indicator (the blinking triangle)
    this.indicator = scene.add.text(0, 0, MORE_INDICATOR_CHAR, {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: "12px",
      color: "#999999",
    });
    this.indicator.setOrigin(1, 1);
    this.indicator.setAlpha(0);
    this.add(this.indicator);

    // Start fully invisible for the show animation
    this.setAlpha(0);
    this.setScale(0.85);

    scene.add.existing(this);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Show a chunk of text with typewriter effect.
   */
  showChunk(text: string, hasMore: boolean): void {
    this._hasMore = hasMore;
    this.fullText = text;
    this.visibleCharCount = 0;
    this._typewriterDone = false;

    // Stop any existing typewriter
    this.stopTypewriter();

    // Stop any indicator blink from a previous chunk
    this.stopIndicatorBlink();
    this.indicator.setAlpha(0);

    // Measure the final text dimensions by temporarily setting full text
    this.textObject.setText(this.fullText);
    this.redrawBubble();

    // Clear displayed text to begin typewriter
    this.textObject.setText("");

    // Start the typewriter timer
    this.typewriterTimer = this.scene.time.addEvent({
      delay: TYPEWRITER_DELAY,
      repeat: this.fullText.length - 1,
      callback: () => {
        this.visibleCharCount++;
        this.textObject.setText(this.fullText.slice(0, this.visibleCharCount));

        if (this.visibleCharCount >= this.fullText.length) {
          this.onTypewriterComplete();
        }
      },
    });

    // Play show animation
    this.playShowAnimation();
  }

  /**
   * Hide with fade animation, then destroy.
   */
  hide(onComplete?: () => void): void {
    this.stopTypewriter();
    this.stopIndicatorBlink();

    if (this.showTween) {
      this.showTween.stop();
      this.showTween = null;
    }

    this.hideTween = this.scene.tweens.add({
      targets: this,
      scaleX: 0.9,
      scaleY: 0.9,
      alpha: 0,
      duration: 150,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (onComplete) onComplete();
        this.destroy();
      },
    });
  }

  /**
   * Whether the current typewriter animation is complete.
   */
  isTypewriterDone(): boolean {
    return this._typewriterDone;
  }

  /**
   * Skip to end of current typewriter -- show full text immediately.
   */
  skipTypewriter(): void {
    if (this._typewriterDone) return;

    this.stopTypewriter();
    this.visibleCharCount = this.fullText.length;
    this.textObject.setText(this.fullText);
    this.onTypewriterComplete();
  }

  /**
   * Update position (call when character moves or canvas resizes).
   * Redraws the bubble so horizontal clamping adjusts to the new position.
   */
  updatePosition(x: number, y: number): void {
    this.setPosition(x, y);
    this.redrawBubble();
  }

  /**
   * Clean up all tweens and timers.
   */
  destroy(fromScene?: boolean): void {
    this.stopTypewriter();
    this.stopIndicatorBlink();

    if (this.showTween) {
      this.showTween.stop();
      this.showTween = null;
    }
    if (this.hideTween) {
      this.hideTween.stop();
      this.hideTween = null;
    }

    super.destroy(fromScene);
  }

  // -------------------------------------------------------------------------
  // Internal: drawing
  // -------------------------------------------------------------------------

  /**
   * Redraws the bubble background (rounded rect + triangle + shadow) based
   * on the current text dimensions, clamping to canvas edges so the bubble
   * is never cut off.
   */
  private redrawBubble(): void {
    this.graphics.clear();

    const textWidth = this.textObject.width;
    const textHeight = this.textObject.height;

    const bubbleWidth = Math.min(textWidth + PADDING * 2, MAX_WIDTH);
    const bubbleHeight = textHeight + PADDING * 2;

    // --- Vertical clamping ---
    // If the bubble would overflow the top of the canvas, push the
    // container down so the top edge stays at TOP_MARGIN.
    const totalHeight = bubbleHeight + TRIANGLE_HEIGHT;
    const bubbleTopWorld = this.y - totalHeight;
    if (bubbleTopWorld < TOP_MARGIN) {
      this.y = TOP_MARGIN + totalHeight;
    }

    // --- Horizontal clamping ---
    // Default: center the bubble over the character (container origin).
    let offsetX = -bubbleWidth / 2;

    const canvasWidth = this.scene.scale.width;
    const worldLeft = this.x + offsetX;
    const worldRight = this.x + offsetX + bubbleWidth;

    if (worldLeft < EDGE_MARGIN) {
      // Bubble overflows the left edge — shift right
      offsetX = -this.x + EDGE_MARGIN;
    } else if (worldRight > canvasWidth - EDGE_MARGIN) {
      // Bubble overflows the right edge — shift left
      offsetX = canvasWidth - EDGE_MARGIN - this.x - bubbleWidth;
    }

    const left = offsetX;
    const top = -(bubbleHeight + TRIANGLE_HEIGHT);

    // --- Drop shadow ---
    this.graphics.fillStyle(SHADOW_COLOR, SHADOW_ALPHA);
    this.graphics.fillRoundedRect(
      left + SHADOW_OFFSET,
      top + SHADOW_OFFSET,
      bubbleWidth,
      bubbleHeight,
      CORNER_RADIUS,
    );

    // --- Bubble fill ---
    this.graphics.fillStyle(BG_COLOR, 1);
    this.graphics.fillRoundedRect(left, top, bubbleWidth, bubbleHeight, CORNER_RADIUS);

    // --- Bubble border ---
    this.graphics.lineStyle(BORDER_WIDTH, BORDER_COLOR, 1);
    this.graphics.strokeRoundedRect(left, top, bubbleWidth, bubbleHeight, CORNER_RADIUS);

    // --- Triangle pointer ---
    // The triangle always points down at the character (x = 0 in container
    // space), but we clamp it so it stays within the rounded body.
    const triHalfW = TRIANGLE_WIDTH / 2;
    const triCenterX = Phaser.Math.Clamp(
      0, // character is at x = 0 relative to the container
      left + CORNER_RADIUS + triHalfW,
      left + bubbleWidth - CORNER_RADIUS - triHalfW,
    );

    const triLeft = triCenterX - triHalfW;
    const triRight = triCenterX + triHalfW;
    const triTop = top + bubbleHeight; // bottom edge of rounded rect
    const triBottom = triTop + TRIANGLE_HEIGHT;

    // Fill
    this.graphics.fillStyle(BG_COLOR, 1);
    this.graphics.fillTriangle(
      triLeft, triTop,
      triRight, triTop,
      triCenterX, triBottom,
    );

    // Border — only the two slanted sides so the top edge blends with
    // the bubble body.
    this.graphics.lineStyle(BORDER_WIDTH, BORDER_COLOR, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(triLeft, triTop);
    this.graphics.lineTo(triCenterX, triBottom);
    this.graphics.lineTo(triRight, triTop);
    this.graphics.strokePath();

    // Fill a small white rect over the triangle-bubble seam to hide it
    this.graphics.fillStyle(BG_COLOR, 1);
    this.graphics.fillRect(
      triLeft + BORDER_WIDTH,
      triTop - BORDER_WIDTH / 2,
      TRIANGLE_WIDTH - BORDER_WIDTH * 2,
      BORDER_WIDTH + 1,
    );

    // --- Position text inside the bubble ---
    this.textObject.setPosition(left + PADDING, top + PADDING);

    // --- Position the "more" indicator ---
    this.indicator.setPosition(
      left + bubbleWidth - PADDING / 2,
      top + bubbleHeight - PADDING / 2,
    );
  }

  // -------------------------------------------------------------------------
  // Internal: animations
  // -------------------------------------------------------------------------

  private playShowAnimation(): void {
    if (this.showTween) {
      this.showTween.stop();
      this.showTween = null;
    }

    this.showTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 200,
      ease: "Back.easeOut",
    });
  }

  // -------------------------------------------------------------------------
  // Internal: typewriter helpers
  // -------------------------------------------------------------------------

  private onTypewriterComplete(): void {
    this._typewriterDone = true;
    this.scene.events.emit("typewriterDone");

    if (this._hasMore) {
      this.startIndicatorBlink();
    }
  }

  private stopTypewriter(): void {
    if (this.typewriterTimer) {
      this.typewriterTimer.destroy();
      this.typewriterTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal: indicator blink
  // -------------------------------------------------------------------------

  private startIndicatorBlink(): void {
    this.stopIndicatorBlink();
    this.indicator.setAlpha(1);

    this.indicatorBlinkTimer = this.scene.time.addEvent({
      delay: INDICATOR_BLINK_DELAY,
      loop: true,
      callback: () => {
        this.indicator.setAlpha(this.indicator.alpha > 0 ? 0 : 1);
      },
    });
  }

  private stopIndicatorBlink(): void {
    if (this.indicatorBlinkTimer) {
      this.indicatorBlinkTimer.destroy();
      this.indicatorBlinkTimer = null;
    }
  }
}
