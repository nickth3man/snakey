import Phaser from "phaser";

const CELL = 20;
const COLS = 30;
const ROWS = 22;
const OFFSET_X = 20;
const OFFSET_Y = 40;
const WALL_COLOR = 0x2d3436;
const GRID_COLOR = 0x16213e;

interface Point {
  x: number;
  y: number;
}

export class GameScene extends Phaser.Scene {
  private snake: Point[] = [];
  private food!: Point;
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
    this.graphics = this.add.graphics();
    this.cursors = this.input.keyboard!.createCursorKeys();

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
    this.input.keyboard!.on("keydown-SPACE", () => this.restartIfDead());

    this.startGame();
  }

  private startGame() {
    this.snake = [
      { x: 5, y: Math.floor(ROWS / 2) },
      { x: 4, y: Math.floor(ROWS / 2) },
      { x: 3, y: Math.floor(ROWS / 2) },
    ];
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.alive = true;
    this.score = 0;
    this.moveTimer = 0;
    this.scoreText.setText("Score: 0");
    this.gameOverText.setVisible(false);
    this.spawnFood();
    this.draw();
  }

  private spawnFood() {
    const occupied = new Set(
      this.snake.map((p) => `${p.x},${p.y}`)
    );
    const free: Point[] = [];
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    this.food = free[Math.floor(Math.random() * free.length)];
  }

  private restartIfDead() {
    if (!this.alive) this.startGame();
  }

  update(_time: number, delta: number) {
    this.handleInput();
    if (!this.alive) return;

    this.moveTimer += delta;
    if (this.moveTimer < this.moveInterval) return;
    this.moveTimer = 0;

    this.direction = { ...this.nextDirection };

    const head = this.snake[0];
    const newHead: Point = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y,
    };

    if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
      this.die();
      return;
    }

    if (this.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      this.die();
      return;
    }

    this.snake.unshift(newHead);

    if (newHead.x === this.food.x && newHead.y === this.food.y) {
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
    this.gameOverText.setVisible(true);
    this.draw();
  }

  private draw() {
    const g = this.graphics;
    g.clear();

    // Border
    g.lineStyle(2, WALL_COLOR, 1);
    g.strokeRect(
      OFFSET_X - 2,
      OFFSET_Y - 2,
      COLS * CELL + 4,
      ROWS * CELL + 4
    );

    // Grid lines (subtle)
    for (let x = 0; x <= COLS; x++) {
      const px = OFFSET_X + x * CELL;
      g.lineStyle(1, GRID_COLOR, 0.3);
      g.lineBetween(px, OFFSET_Y, px, OFFSET_Y + ROWS * CELL);
    }
    for (let y = 0; y <= ROWS; y++) {
      const py = OFFSET_Y + y * CELL;
      g.lineStyle(1, GRID_COLOR, 0.3);
      g.lineBetween(OFFSET_X, py, OFFSET_X + COLS * CELL, py);
    }

    // Snake
    this.snake.forEach((seg, i) => {
      const px = OFFSET_X + seg.x * CELL;
      const py = OFFSET_Y + seg.y * CELL;
      g.fillStyle(i === 0 ? 0x00cec9 : 0x6c5ce7, this.alive ? 1 : 0.4);
      g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    });

    // Food
    const fx = OFFSET_X + this.food.x * CELL + CELL / 2;
    const fy = OFFSET_Y + this.food.y * CELL + CELL / 2;
    g.fillStyle(0xff7675, this.alive ? 1 : 0.4);
    g.fillCircle(fx, fy, CELL / 2 - 2);
  }
}
