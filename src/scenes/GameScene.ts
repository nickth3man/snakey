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

export class GameScene extends Phaser.Scene {
  private engine!: SnakeGame;
  private directionQueue: Point[] = [];
  private moveTimer = 0;
  private moveInterval = 130;

  private scoreText!: Phaser.GameObjects.Text;
  private bestScore = 0;
  private bestScoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private graphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("GameScene");
  }

  create() {
    const kb = this.input.keyboard;
    if (!kb) return;

    this.graphics = this.add.graphics();
    this.cursors = kb.createCursorKeys();
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

    this.startGame();
  }

  private startGame() {
    this.engine.start();
    this.directionQueue = [];
    this.moveTimer = 0;
    this.scoreText.setText("Score: 0");
    this.gameOverText.setVisible(false);
    this.draw();
  }

  private restartIfDead() {
    if (!this.engine.getState().alive) this.startGame();
  }

  update(_time: number, delta: number) {
    const state = this.engine.getState();
    if (!state.alive) return;
    this.handleInput();

    this.moveTimer += delta;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      const dir = this.directionQueue.shift() ?? state.direction;
      const result = this.engine.step(dir);
      const newState = this.engine.getState();
      this.scoreText.setText(`Score: ${newState.score}`);

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
    this.gameOverText.setText("Game Over\nClick or press Space to restart");
    this.gameOverText.setVisible(true);
    this.draw();
  }

  private win() {
    this.persistBestScore();
    this.gameOverText.setText("You Win!\nClick or press Space to restart");
    this.gameOverText.setVisible(true);
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
    this.drawSnake(state.snake, alpha);
    this.drawFood(state.food, alpha);
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

  private drawSnake(snake: Point[], alpha: number) {
    const g = this.graphics;
    snake.forEach((seg, i) => {
      g.fillStyle(i === 0 ? SNAKE_HEAD_COLOR : SNAKE_BODY_COLOR, alpha);
      g.fillRect(
        this.gridX(seg.x) + 1,
        this.gridY(seg.y) + 1,
        CELL - 2,
        CELL - 2,
      );
    });
  }

  private drawFood(food: Point | null, alpha: number) {
    if (!food) return;
    const g = this.graphics;
    g.fillStyle(FOOD_COLOR, alpha);
    g.fillCircle(
      this.gridX(food.x) + CELL / 2,
      this.gridY(food.y) + CELL / 2,
      CELL / 2 - 2,
    );
  }
}
