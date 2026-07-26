import Phaser from "phaser";
import type { Point } from "../game/engine";

/**
 * Touch / pointer controls for Snakey.
 *
 * - Swipe on the playfield feeds a direction into the scene's `enqueue` path.
 * - Tap (down + up, no movement, short) calls `onTap` (restart-on-death).
 * - Optional on-screen D-pad as a visible fallback for coarse pointers (touch).
 *
 * Pointer coordinates are delivered in the scene's internal coordinate space
 * because the game runs under `Phaser.Scale.FIT`, so no manual mapping is needed.
 */

export interface TouchControlsOptions {
  /** Called with a swipe direction. `null` in demo mode (no swipe / no D-pad). */
  onSwipe: ((dir: Point) => void) | null;
  /** Called on a clean tap. Used for restart-on-death in both modes. */
  onTap: () => void;
  /** When true, an on-screen D-pad is created (pass true only for touch devices). */
  enableDPad: boolean;
}

interface Gesture {
  startX: number;
  startY: number;
  startTime: number;
  /** True once a swipe direction has been emitted for this gesture. */
  fired: boolean;
  /** True if the gesture began on the D-pad (field-swipe suppressed). */
  suppressed: boolean;
}

const DEADZONE = 24; // internal px (~one cell + a bit) before a swipe registers
const TAP_MAX_TIME = 250; // ms; slower than this is not a tap
const TAP_MAX_DIST = DEADZONE; // must not have moved beyond the deadzone

// D-pad geometry (internal coordinate space; canvas is 640x500)
const DPAD_CX = 552;
const DPAD_CY = 420;
const DPAD_STEP = 50; // center-to-center distance between buttons
const DPAD_FONT_SIZE = "40px";
const DPAD_COLOR = "#00cec9";
const DPAD_ALPHA_IDLE = 0.25;
const DPAD_ALPHA_ACTIVE = 0.7;

export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly onSwipe: ((dir: Point) => void) | null;
  private readonly onTap: () => void;
  private readonly gestures = new Map<number, Gesture>();
  private dpadBounds: Phaser.Geom.Rectangle | null = null;

  constructor(scene: Phaser.Scene, opts: TouchControlsOptions) {
    this.scene = scene;
    this.onSwipe = opts.onSwipe;
    this.onTap = opts.onTap;

    scene.input.on("pointerdown", this.handleDown, this);
    scene.input.on("pointermove", this.handleMove, this);
    scene.input.on("pointerup", this.handleUp, this);
    scene.input.on("pointerupoutside", this.handleUp, this);

    if (opts.enableDPad && this.onSwipe) {
      this.createDPad();
    }
  }

  /* ──────────── Pointer state machine ──────────── */

  private handleDown(pointer: Phaser.Input.Pointer) {
    // Gestures that begin on the D-pad must not also be treated as field swipes;
    // the D-pad buttons emit directions via their own handlers.
    const suppressed =
      this.dpadBounds !== null && this.dpadBounds.contains(pointer.x, pointer.y);
    this.gestures.set(pointer.id, {
      startX: pointer.x,
      startY: pointer.y,
      startTime: this.scene.time.now,
      fired: false,
      suppressed,
    });
  }

  private handleMove(pointer: Phaser.Input.Pointer) {
    if (!this.onSwipe) return;
    const g = this.gestures.get(pointer.id);
    if (!g || g.fired || g.suppressed) return;

    const dx = pointer.x - g.startX;
    const dy = pointer.y - g.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < DEADZONE) return;

    g.fired = true;
    // Axis-lock: pick the dominant axis, ignore the minor one.
    const dir: Point =
      Math.abs(dx) > Math.abs(dy)
        ? { x: dx < 0 ? -1 : 1, y: 0 }
        : { x: 0, y: dy < 0 ? -1 : 1 };
    this.onSwipe(dir);
  }

  private handleUp(pointer: Phaser.Input.Pointer) {
    const g = this.gestures.get(pointer.id);
    if (!g) return;

    // A tap is a short, stationary press that did not fire a swipe and was not
    // on the D-pad. This keeps swipes from restarting and taps from steering.
    if (!g.fired && !g.suppressed) {
      const dx = pointer.x - g.startX;
      const dy = pointer.y - g.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = this.scene.time.now - g.startTime;
      if (dist <= TAP_MAX_DIST && dt <= TAP_MAX_TIME) {
        this.onTap();
      }
    }

    this.gestures.delete(pointer.id);
  }

  /* ──────────── D-pad ──────────── */

  private createDPad() {
    const onSwipe = this.onSwipe;
    if (!onSwipe) return; // narrowed for the closure below

    const make = (
      x: number,
      y: number,
      glyph: string,
      dir: Point,
    ): Phaser.GameObjects.Text => {
      const btn = this.scene.add
        .text(x, y, glyph, {
          fontFamily: "monospace",
          fontSize: DPAD_FONT_SIZE,
          color: DPAD_COLOR,
        })
        .setOrigin(0.5)
        .setAlpha(DPAD_ALPHA_IDLE)
        .setDepth(20)
        .setInteractive({ useHandCursor: false });

      btn.on("pointerover", () => btn.setAlpha(DPAD_ALPHA_ACTIVE));
      btn.on("pointerout", () => btn.setAlpha(DPAD_ALPHA_IDLE));
      btn.on("pointerdown", () => {
        btn.setAlpha(DPAD_ALPHA_ACTIVE);
        this.scene.tweens.add({
          targets: btn,
          scaleX: 0.88,
          scaleY: 0.88,
          duration: 60,
          yoyo: true,
          ease: "Power2",
        });
        onSwipe(dir);
      });
      return btn;
    };

    make(DPAD_CX, DPAD_CY - DPAD_STEP, "\u25B2", { x: 0, y: -1 }); // up
    make(DPAD_CX, DPAD_CY + DPAD_STEP, "\u25BC", { x: 0, y: 1 }); // down
    make(DPAD_CX - DPAD_STEP, DPAD_CY, "\u25C0", { x: -1, y: 0 }); // left
    make(DPAD_CX + DPAD_STEP, DPAD_CY, "\u25B6", { x: 1, y: 0 }); // right

    // Region used to suppress field-swipe for gestures that begin on the D-pad.
    const pad = DPAD_STEP + 24;
    this.dpadBounds = new Phaser.Geom.Rectangle(
      DPAD_CX - pad,
      DPAD_CY - pad,
      pad * 2,
      pad * 2,
    );
  }

  /* ──────────── Teardown ──────────── */

  destroy() {
    this.scene.input.off("pointerdown", this.handleDown, this);
    this.scene.input.off("pointermove", this.handleMove, this);
    this.scene.input.off("pointerup", this.handleUp, this);
    this.scene.input.off("pointerupoutside", this.handleUp, this);
    this.gestures.clear();
  }
}
