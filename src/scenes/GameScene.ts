import Phaser from "phaser";
import {
  CELL,
  COLS,
  ROWS,
  OFFSET_X,
  OFFSET_Y,
  WALL_COLOR,
  GRID_COLOR,
  SNAKE_HEAD_COLOR,
  SNAKE_BODY_COLOR,
  FOOD_COLOR,
  CANVAS_WIDTH,
} from "../config";
import { SnakeGame, Point } from "../game/engine";
import { getAIDirection, AIDebugInfo } from "../ai/demo-controller";

export class GameScene extends Phaser.Scene {
  private engine!: SnakeGame;
  private directionQueue: Point[] = [];
  private moveTimer = 0;
  private moveInterval = 130;
  private mode: "normal" | "demo" = "normal";

  private scoreText!: Phaser.GameObjects.Text;
  private bestScore = 0;
  private bestScoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private graphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  // Juice: dedicated GameObjects for head + food
  private headRect!: Phaser.GameObjects.Rectangle;
  private foodCircle!: Phaser.GameObjects.Arc;
  private lastFoodKey: string | null = null;

  // AI debug visualization
  private aiDebug: AIDebugInfo | null = null;
  private showAIDebug = false;
  private tierBadge!: Phaser.GameObjects.Text;
  private debugGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super("GameScene");
  }

  init(data: { mode?: "normal" | "demo" }) {
    this.mode = data?.mode ?? "normal";
  }

  create() {
    const kb = this.input.keyboard;
    if (!kb) return;

    this.graphics = this.add.graphics();
    this.debugGraphics = this.add.graphics().setDepth(15);

    // Dedicated GameObjects for juice: food (depth 5), head (depth 10)
    this.foodCircle = this.add
      .circle(0, 0, CELL / 2 - 2, FOOD_COLOR)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(5);
    this.headRect = this.add
      .rectangle(0, 0, CELL - 2, CELL - 2, SNAKE_HEAD_COLOR)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(10);

    // One-time particle texture (tiny food-colored dot)
    if (!this.textures.exists("particle-food")) {
      const pg = this.add.graphics();
      pg.fillStyle(FOOD_COLOR, 1);
      pg.fillCircle(4, 4, 4);
      pg.generateTexture("particle-food", 8, 8);
      pg.destroy();
    }
    if (this.mode === "normal") {
      this.cursors = kb.createCursorKeys();
    }
    this.engine = new SnakeGame({ cols: COLS, rows: ROWS });

    this.scoreText = this.add.text(OFFSET_X, 10, "Score: 0", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#e0e0e0",
    });

    let savedBest: number | null = null;
    try {
      const raw = localStorage.getItem("snakey-best-score");
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) savedBest = parsed;
      }
    } catch {
      // localStorage unavailable
    }
    this.bestScore = savedBest ?? 0;
    this.bestScoreText = this.add
      .text(
        CANVAS_WIDTH - OFFSET_X,
        10,
        savedBest !== null ? `Best: ${savedBest}` : "Best: \u2014",
        { fontFamily: "monospace", fontSize: "18px", color: "#e0e0e0" }
      )
      .setOrigin(1, 0);

    this.tierBadge = this.add.text(OFFSET_X, 36, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#00cec9",
    }).setVisible(false).setDepth(20);

    this.gameOverText = this.add
      .text(320, 260, "Game Over\nClick or press Space to restart", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#ff6b6b",
        align: "center",
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.input.on("pointerdown", () => this.restartIfDead());
    kb.on("keydown-SPACE", () => this.restartIfDead());
    kb.on("keydown-M", () => this.scene.start("MenuScene"));
    if (this.mode === "demo") {
      kb.on("keydown-V", () => this.toggleDebug());
    }

    this.startGame();
  }

  private startGame() {
    this.engine.start();
    this.directionQueue = [];
    this.moveTimer = 0;
    this.scoreText.setText("Score: 0");
    this.gameOverText.setVisible(false);
    this.aiDebug = null;
    this.showAIDebug = false;
    this.tierBadge?.setVisible(false);
    this.debugGraphics?.clear();
    // Reset juice state: kill tweens, hide + unscale head/food
    this.tweens.killTweensOf([this.headRect, this.foodCircle]);
    this.headRect?.setScale(1).setVisible(false);
    this.foodCircle?.setScale(1).setVisible(false);
    this.lastFoodKey = null;
    this.draw();
  }

  private restartIfDead() {
    if (!this.engine.getState().alive) this.startGame();
  }

  update(_time: number, delta: number) {
    const state = this.engine.getState();
    if (!state.alive) return;

    if (this.mode === "normal") {
      this.handleInput();
    }

    this.moveTimer += delta;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      let dir: Point;
      if (this.mode === "demo") {
        const ai = getAIDirection(state, COLS, ROWS);
        this.aiDebug = ai.debug;
        dir = ai.dir;
      } else {
        dir = this.directionQueue.shift() ?? state.direction;
      }
      const result = this.engine.step(dir);
      const newState = this.engine.getState();
      this.scoreText.setText(`Score: ${newState.score}`);

      if (result.ate) {
        this.spawnEatParticles(newState.snake[0]);
        this.pulseHead();
      }

      if (result.won) {
        this.win();
      } else if (result.died) {
        this.die();
      } else {
        this.draw();
      }
    }
  }

  private handleInput() {
    const state = this.engine.getState();
    const refDir = this.directionQueue.length > 0
      ? this.directionQueue[this.directionQueue.length - 1]
      : state.direction;

    if (this.cursors.left.isDown && refDir.x !== 1) {
      this.enqueue({ x: -1, y: 0 });
    } else if (this.cursors.right.isDown && refDir.x !== -1) {
      this.enqueue({ x: 1, y: 0 });
    } else if (this.cursors.up.isDown && refDir.y !== 1) {
      this.enqueue({ x: 0, y: -1 });
    } else if (this.cursors.down.isDown && refDir.y !== -1) {
      this.enqueue({ x: 0, y: 1 });
    }
  }

  private enqueue(dir: Point) {
    if (this.directionQueue.length >= 2) return;
    const last = this.directionQueue.length > 0
      ? this.directionQueue[this.directionQueue.length - 1]
      : this.engine.getState().direction;
    if (dir.x === -last.x && dir.y === -last.y) return;
    this.directionQueue.push(dir);
  }

  private die() {
    this.persistBestScore();
    this.gameOverText.setText("Game Over\nSpace to retry · M for Menu");
    this.gameOverText.setVisible(true);
    this.tierBadge?.setVisible(false);
    this.cameras.main.shake(200, 0.005);
    this.draw();
  }

  private win() {
    this.persistBestScore();
    this.gameOverText.setText("You Win!\nSpace to retry · M for Menu");
    this.gameOverText.setVisible(true);
    this.tierBadge?.setVisible(false);
    this.draw();
  }

  private persistBestScore() {
    const score = this.engine.getState().score;
    if (score > this.bestScore) {
      this.bestScore = score;
      this.bestScoreText.setText(`Best: ${this.bestScore}`);
      try {
        localStorage.setItem("snakey-best-score", String(this.bestScore));
      } catch {
        // localStorage unavailable
      }
    }
  }

  /* ──────────── Rendering ──────────── */

  private draw() {
    const state = this.engine.getState();
    this.graphics.clear();
    this.drawBorder();
    this.drawGrid();

    const alpha = state.alive ? 1 : 0.4;
    this.drawBody(state.snake, alpha);
    this.drawHead(state.snake[0], alpha);
    this.drawFood(state.food, alpha);

    if (this.mode === "demo" && this.showAIDebug && this.aiDebug) {
      this.drawAIDebug();
    }
  }

  private drawBorder() {
    const g = this.graphics;
    g.lineStyle(2, WALL_COLOR, 1);
    g.strokeRect(OFFSET_X - 2, OFFSET_Y - 2, COLS * CELL + 4, ROWS * CELL + 4);
  }

  private drawGrid() {
    const g = this.graphics;
    g.lineStyle(1, GRID_COLOR, 0.3);
    for (let x = 0; x <= COLS; x++) {
      const px = this.gridX(x);
      g.lineBetween(px, OFFSET_Y, px, OFFSET_Y + ROWS * CELL);
    }
    for (let y = 0; y <= ROWS; y++) {
      const py = this.gridY(y);
      g.lineBetween(OFFSET_X, py, OFFSET_X + COLS * CELL, py);
    }
  }

  private gridX(col: number) {
    return OFFSET_X + col * CELL;
  }

  private gridY(row: number) {
    return OFFSET_Y + row * CELL;
  }

  private drawBody(snake: Point[], alpha: number) {
    const g = this.graphics;
    for (let i = 1; i < snake.length; i++) {
      const seg = snake[i];
      g.fillStyle(SNAKE_BODY_COLOR, alpha);
      g.fillRect(this.gridX(seg.x) + 1, this.gridY(seg.y) + 1, CELL - 2, CELL - 2);
    }
  }

  private drawHead(head: Point, alpha: number) {
    this.headRect
      .setPosition(this.gridX(head.x) + CELL / 2, this.gridY(head.y) + CELL / 2)
      .setFillStyle(SNAKE_HEAD_COLOR, alpha)
      .setVisible(true);
  }

  private drawFood(foodPos: Point | null, alpha: number) {
    if (!foodPos) {
      this.foodCircle.setVisible(false);
      this.lastFoodKey = null;
      return;
    }
    const k = `${foodPos.x},${foodPos.y}`;
    this.foodCircle
      .setPosition(this.gridX(foodPos.x) + CELL / 2, this.gridY(foodPos.y) + CELL / 2)
      .setFillStyle(FOOD_COLOR, alpha)
      .setVisible(true);
    if (k !== this.lastFoodKey) {
      this.lastFoodKey = k;
      this.tweens.killTweensOf(this.foodCircle);
      this.foodCircle.setScale(0);
      this.tweens.add({
        targets: this.foodCircle,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: "Back.easeOut",
      });
    }
  }

  /* ──────────── Juice ──────────── */

  private spawnEatParticles(head: Point) {
    const x = this.gridX(head.x) + CELL / 2;
    const y = this.gridY(head.y) + CELL / 2;
    const emitter = this.add.particles(x, y, "particle-food", {
      speed: { min: 40, max: 140 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 600 },
      quantity: 1,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: "ADD",
      emitting: false,
    });
    emitter.setDepth(12);
    emitter.explode(20);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  private pulseHead() {
    this.tweens.killTweensOf(this.headRect);
    this.headRect.setScale(1);
    this.tweens.add({
      targets: this.headRect,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  /* ──────────── AI Debug Visualization ──────────── */

  private toggleDebug() {
    this.showAIDebug = !this.showAIDebug;
    if (!this.showAIDebug) {
      this.tierBadge.setVisible(false);
      this.debugGraphics.clear();
    }
  }

  private drawAIDebug() {
    if (!this.aiDebug) return;
    const g = this.debugGraphics;
    g.clear();

    // --- Flood-fill region ---
    g.fillStyle(0x6c5ce7, 0.15);
    for (const cell of this.aiDebug.reachable) {
      g.fillRect(this.gridX(cell.x) + 1, this.gridY(cell.y) + 1, CELL - 2, CELL - 2);
    }

    // --- BFS path (dashed) ---
    const path = this.aiDebug.path;
    if (path.length >= 2) {
      g.lineStyle(2, 0xff7675, 0.9);
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1];
        const to = path[i];
        const x1 = this.gridX(from.x) + CELL / 2;
        const y1 = this.gridY(from.y) + CELL / 2;
        const x2 = this.gridX(to.x) + CELL / 2;
        const y2 = this.gridY(to.y) + CELL / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.floor(dist / 6);
        if (steps < 1) {
          g.lineBetween(x1, y1, x2, y2);
          continue;
        }
        const stepX = dx / steps;
        const stepY = dy / steps;
        for (let s = 0; s < steps; s++) {
          if (s % 2 === 0) {
            // draw on-segment
            g.lineBetween(
              x1 + s * stepX, y1 + s * stepY,
              x1 + (s + 1) * stepX, y1 + (s + 1) * stepY,
            );
          }
        }
      }
    }

    // --- Tier badge ---
    const tier = this.aiDebug.tier;
    const colors: Record<string, string> = {
      tier1: "#00cec9",
      tier2: "#fdcb6e",
      fallback: "#ff7675",
    };
    const labels: Record<string, string> = {
      tier1: "Tier 1 · Safe Pursuit",
      tier2: "Tier 2 · Max Space",
      fallback: "Fallback · Toward Food",
    };
    this.tierBadge.setText(labels[tier]);
    this.tierBadge.setColor(colors[tier]);
    this.tierBadge.setVisible(true);
  }
}
