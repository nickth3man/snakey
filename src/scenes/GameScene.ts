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
} from "../config";

interface Point {
  x: number;
  y: number;
}

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

export class GameScene extends Phaser.Scene {
  private snake: Point[] = [];
  private food: Point | null = null;
  private direction!: Point;
  private nextDirection!: Point;
  private moveTimer = 0;
  private moveInterval = 130;
  private alive = false;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
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

    this.scoreText = this.add.text(OFFSET_X, 10, "Score: 0", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#e0e0e0",
    });

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
    const midRow = Math.floor(ROWS / 2);
    this.snake = [5, 4, 3].map((x) => ({ x, y: midRow }));
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.alive = true;
    this.score = 0;
    this.moveTimer = 0;
    this.scoreText.setText(`Score: ${this.score}`);
    this.gameOverText.setVisible(false);
    this.spawnFood();
    this.draw();
  }

  private spawnFood() {
    const free: Point[] = [];
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!this.hitsSnake({ x, y })) free.push({ x, y });
      }
    }
    if (free.length === 0) {
      this.food = null;
      this.win();
      return;
    }
    this.food = free[Math.floor(Math.random() * free.length)];
  }

  private restartIfDead() {
    if (!this.alive) this.startGame();
  }

  private gridX(col: number) {
    return OFFSET_X + col * CELL;
  }

  private gridY(row: number) {
    return OFFSET_Y + row * CELL;
  }

  private isOutOfBounds(p: Point) {
    return p.x < 0 || p.x >= COLS || p.y < 0 || p.y >= ROWS;
  }

  private hitsSnake(p: Point) {
    return this.snake.some((s) => samePoint(s, p));
  }

  update(_time: number, delta: number) {
    this.handleInput();
    if (!this.alive) return;

    this.moveTimer += delta;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      this.moveSnake();
    }
  }

  private moveSnake() {
    this.direction = this.nextDirection;

    const head = this.snake[0];
    const newHead: Point = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y,
    };

    if (this.isOutOfBounds(newHead) || this.hitsSnake(newHead)) {
      this.die();
      return;
    }

    this.snake.unshift(newHead);

    if (this.food && samePoint(newHead, this.food)) {
      this.score++;
      this.scoreText.setText(`Score: ${this.score}`);
      this.spawnFood();
    } else {
      this.snake.pop();
    }

    this.draw();
  }

  private handleInput() {
    const d = this.direction;
    if (this.cursors.left.isDown && d.x !== 1) {
      this.nextDirection = { x: -1, y: 0 };
    } else if (this.cursors.right.isDown && d.x !== -1) {
      this.nextDirection = { x: 1, y: 0 };
    } else if (this.cursors.up.isDown && d.y !== 1) {
      this.nextDirection = { x: 0, y: -1 };
    } else if (this.cursors.down.isDown && d.y !== -1) {
      this.nextDirection = { x: 0, y: 1 };
    }
  }

  private die() {
    this.alive = false;
    this.gameOverText.setText("Game Over\nClick or press Space to restart");
    this.gameOverText.setVisible(true);
    this.draw();
  }

  private win() {
    this.alive = false;
    this.gameOverText.setText("You Win!\nClick or press Space to restart");
    this.gameOverText.setVisible(true);
    this.draw();
  }

  private draw() {
    this.graphics.clear();
    this.drawBorder();
    this.drawGrid();

    const alpha = this.alive ? 1 : 0.4;
    this.drawSnake(alpha);
    this.drawFood(alpha);
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

  private drawSnake(alpha: number) {
    const g = this.graphics;
    this.snake.forEach((seg, i) => {
      g.fillStyle(i === 0 ? SNAKE_HEAD_COLOR : SNAKE_BODY_COLOR, alpha);
      g.fillRect(this.gridX(seg.x) + 1, this.gridY(seg.y) + 1, CELL - 2, CELL - 2);
    });
  }

  private drawFood(alpha: number) {
    if (!this.food) return;
    const g = this.graphics;
    g.fillStyle(FOOD_COLOR, alpha);
    g.fillCircle(
      this.gridX(this.food.x) + CELL / 2,
      this.gridY(this.food.y) + CELL / 2,
      CELL / 2 - 2
    );
  }
}
