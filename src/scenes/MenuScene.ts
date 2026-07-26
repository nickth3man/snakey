import Phaser from "phaser";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BACKGROUND_COLOR,
  SNAKE_HEAD_COLOR,
  SNAKE_BODY_COLOR,
  FOOD_COLOR,
  CELL,
  OFFSET_X,
  OFFSET_Y,
} from "../config";

/* ──────────── Constants ──────────── */

const CARD_W = 260;
const CARD_H = 160;
const CARD_RADIUS = 14;
const CARD_GAP = 30;
const LEFT_CARD_CX = (CANVAS_WIDTH - CARD_GAP) / 2 - CARD_W / 2;
const RIGHT_CARD_CX = (CANVAS_WIDTH + CARD_GAP) / 2 + CARD_W / 2;
const CARDS_CY = 280;

const COLOR_CYAN = 0x00cec9;
const COLOR_PURPLE = 0x6c5ce7;
const COLOR_RED = 0xff7675;

const MUTED_TEXT = "#636e72";
const BRIGHT_MUTED = "#b2bec3";
const ACCENT_CYAN_STR = "#00cec9";
const ACCENT_PURPLE_STR = "#6c5ce7";

/* ──────────── Helpers ──────────── */

function hex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

/* ================================================================
   MENU SCENE
   ================================================================ */

export class MenuScene extends Phaser.Scene {
  private cardsReady = false;

  constructor() {
    super({ key: "MenuScene" });
  }

  /* ────── Preload ────── */

  preload() {
    this.load.json("benchmark", "benchmark.json");
  }

  /* ────── Create ────── */

  create() {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;

    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.drawBackgroundDecoration(W, H);

    /* ---- Title ---- */
    const title = this.add
      .text(W / 2, 70, "SNAKEY", {
        fontFamily: "monospace",
        fontSize: "68px",
        color: ACCENT_CYAN_STR,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    /* ---- Subtitle ---- */
    const subtitle = this.add
      .text(W / 2, 128, "Choose your mode", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: MUTED_TEXT,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    /* ---- Cards ---- */
    const normalCard = this.createModeCard(
      LEFT_CARD_CX,
      CARDS_CY,
      "NORMAL",
      "Play with arrow keys",
      COLOR_CYAN,
      ACCENT_CYAN_STR,
      () => this.scene.start("GameScene", { mode: "normal" }),
    );
    normalCard.setAlpha(0).setScale(0.85);

    const demoCard = this.createModeCard(
      RIGHT_CARD_CX,
      CARDS_CY,
      "DEMO",
      "Watch the AI",
      COLOR_PURPLE,
      ACCENT_PURPLE_STR,
      () => this.scene.start("GameScene", { mode: "demo" }),
    );
    demoCard.setAlpha(0).setScale(0.85);

    /* ---- Best Score ---- */
    let bestScoreLabel = "Best: \u2014";
    try {
      const raw = localStorage.getItem("snakey-best-score");
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) bestScoreLabel = `Best: ${n}`;
      }
    } catch {
      /* localStorage unavailable */
    }

    const scoreText = this.add
      .text(W / 2, 465, bestScoreLabel, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: MUTED_TEXT,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    /* ---- Keyboard shortcuts ---- */
    const kb = this.input.keyboard;
    if (kb) {
      kb.on("keydown-N", () =>
        this.scene.start("GameScene", { mode: "normal" }),
      );
      kb.on("keydown-D", () =>
        this.scene.start("GameScene", { mode: "demo" }),
      );
    }

    /* ---- Orchestrated entrance ---- */
    this.tweens.add({
      targets: title,
      alpha: 1,
      y: 70,
      duration: 600,
      ease: "Power3.easeOut",
    });

    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      duration: 400,
      delay: 180,
      ease: "Power2.easeOut",
    });

    this.tweens.add({
      targets: normalCard,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 450,
      delay: 350,
      ease: "Back.easeOut",
    });

    this.tweens.add({
      targets: demoCard,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 450,
      delay: 500,
      ease: "Back.easeOut",
      onComplete: () => {
        this.cardsReady = true;
      },
    });

    this.tweens.add({
      targets: scoreText,
      alpha: 1,
      duration: 400,
      delay: 700,
      ease: "Power2.easeOut",
    });

    /* ---- AI Benchmark Stats ---- */
    const bm = this.cache.json.get("benchmark") as { runs: number; version: number; max: number; winRate: number } | undefined;
    const aiStatsLabel =
      bm && bm.runs > 0
        ? `AI best: ${bm.max} · win rate: ${(bm.winRate * 100).toFixed(0)}%`
        : "AI: run `npm run benchmark`";

    const aiStatsText = this.add
      .text(W / 2, 493, aiStatsLabel, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: ACCENT_PURPLE_STR,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: aiStatsText,
      alpha: 1,
      duration: 400,
      delay: 850,
      ease: "Power2.easeOut",
    });
  }

  /* ────── Background Decoration ────── */

  private drawBackgroundDecoration(w: number, h: number) {
    const g = this.add.graphics();

    /* Subtle grid — echoes the game grid */
    g.lineStyle(1, 0xffffff, 0.025);
    for (let x = 0; x <= w; x += CELL) {
      g.lineBetween(x, 0, x, h);
    }
    for (let y = 0; y <= h; y += CELL) {
      g.lineBetween(0, y, w, y);
    }

    /* Faint horizontal accent lines */
    const accentAlpha = 0.06;
    g.lineStyle(2, COLOR_CYAN, accentAlpha);
    g.lineBetween(OFFSET_X, 155, w / 2 - 80, 155);
    g.lineBetween(w / 2 + 80, 155, w - OFFSET_X, 155);

    g.lineStyle(1, COLOR_PURPLE, accentAlpha * 0.8);
    g.lineBetween(OFFSET_X, 420, w - OFFSET_X, 420);

    /* Winding snake-like decorative path — very subtle */
    g.lineStyle(1.5, COLOR_CYAN, 0.04);
    const path = g;
    const startX = w - 60;
    const startY = h - 100;
    path.beginPath();
    path.moveTo(startX, startY);
    // S-curve
    path.lineTo(startX - 40, startY - 30);
    path.lineTo(startX - 120, startY - 50);
    path.lineTo(startX - 180, startY - 20);
    path.lineTo(startX - 200, startY + 10);
    path.strokePath();

    /* Scattered subtle dots along the path */
    g.fillStyle(COLOR_CYAN, 0.06);
    const dots: [number, number][] = [
      [startX - 20, startY - 15],
      [startX - 60, startY - 38],
      [startX - 100, startY - 48],
      [startX - 150, startY - 38],
      [startX - 185, startY - 10],
      [startX - 198, startY + 5],
    ];
    for (const [dx, dy] of dots) {
      g.fillCircle(dx, dy, 3);
    }

    /* A couple of faint food-colored accent dots for atmosphere */
    g.fillStyle(FOOD_COLOR, 0.05);
    g.fillCircle(OFFSET_X + 30, h - 60, 4);
    g.fillCircle(w - OFFSET_X - 50, OFFSET_Y + 30, 3);
  }

  /* ────── Mode Card Factory ────── */

  private createModeCard(
    cx: number,
    cy: number,
    label: string,
    subtitle: string,
    accentNum: number,
    accentStr: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy);
    const hoverTween = { ref: null as Phaser.Tweens.Tween | null };

    /* ---- Card background graphics ---- */
    const gfx = this.add.graphics();
    container.add(gfx);

    /* ---- Shadow (drawn first, behind card) ---- */
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillRoundedRect(
      -CARD_W / 2 + 4,
      -CARD_H / 2 + 4,
      CARD_W,
      CARD_H,
      CARD_RADIUS,
    );
    container.addAt(shadow, 0);

    /* ---- Mode label ---- */
    const labelText = this.add
      .text(0, -18, label, {
        fontFamily: "monospace",
        fontSize: "26px",
        color: accentStr,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(labelText);

    /* ---- Subtitle ---- */
    const subText = this.add
      .text(0, 18, subtitle, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: MUTED_TEXT,
      })
      .setOrigin(0.5);
    container.add(subText);

    /* ---- Initial draw ---- */
    this.drawCard(gfx, accentNum, false);

    /* ---- Interactivity ---- */
    container.setSize(CARD_W, CARD_H);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => {
      if (!this.cardsReady) return;
      if (hoverTween.ref) hoverTween.ref.stop();

      this.drawCard(gfx, accentNum, true);
      labelText.setColor("#ffffff");
      subText.setColor(BRIGHT_MUTED);

      hoverTween.ref = this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 180,
        ease: "Back.easeOut",
      });
    });

    container.on("pointerout", () => {
      if (!this.cardsReady) return;
      if (hoverTween.ref) hoverTween.ref.stop();

      this.drawCard(gfx, accentNum, false);
      labelText.setColor(accentStr);
      subText.setColor(MUTED_TEXT);

      hoverTween.ref = this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: "Back.easeIn",
      });
    });

    container.on("pointerdown", () => {
      // Brief press-down feedback
      this.tweens.add({
        targets: container,
        scaleX: 0.96,
        scaleY: 0.96,
        duration: 60,
        yoyo: true,
        ease: "Power2",
        onComplete: onClick,
      });
    });

    return container;
  }

  /* ────── Card Drawing ────── */

  private drawCard(
    gfx: Phaser.GameObjects.Graphics,
    accentNum: number,
    hovered: boolean,
  ) {
    gfx.clear();

    const fillAlpha = hovered ? 0.22 : 0.08;
    const strokeAlpha = hovered ? 1 : 0.55;
    const strokeWidth = hovered ? 2.5 : 2;

    /* Fill */
    gfx.fillStyle(accentNum, fillAlpha);
    gfx.fillRoundedRect(
      -CARD_W / 2,
      -CARD_H / 2,
      CARD_W,
      CARD_H,
      CARD_RADIUS,
    );

    /* Border with subtle inner glow on hover */
    if (hovered) {
      // Outer border
      gfx.lineStyle(strokeWidth + 1, accentNum, 0.3);
      gfx.strokeRoundedRect(
        -CARD_W / 2 - 1,
        -CARD_H / 2 - 1,
        CARD_W + 2,
        CARD_H + 2,
        CARD_RADIUS + 1,
      );
    }

    /* Main border */
    gfx.lineStyle(strokeWidth, accentNum, strokeAlpha);
    gfx.strokeRoundedRect(
      -CARD_W / 2,
      -CARD_H / 2,
      CARD_W,
      CARD_H,
      CARD_RADIUS,
    );

    /* Top accent line inside card */
    gfx.lineStyle(1, accentNum, hovered ? 0.5 : 0.2);
    gfx.lineBetween(
      -CARD_W / 2 + CARD_RADIUS,
      -CARD_H / 2 + 6,
      CARD_W / 2 - CARD_RADIUS,
      -CARD_H / 2 + 6,
    );
  }
}
