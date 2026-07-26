import { Point } from "../game/engine";

const DIRECTIONS: Point[] = [
  { x: 0, y: -1 },  // UP
  { x: 1, y: 0 },   // RIGHT
  { x: 0, y: 1 },   // DOWN
  { x: -1, y: 0 },  // LEFT
];

function key(p: Point): string {
  return `${p.x},${p.y}`;
}

function isOpposite(a: Point, b: Point): boolean {
  return a.x === -b.x && a.y === -b.y;
}

function inBounds(p: Point, cols: number, rows: number): boolean {
  return p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows;
}

function isWallAdjacent(p: Point, cols: number, rows: number): boolean {
  return p.x === 0 || p.x === cols - 1 || p.y === 0 || p.y === rows - 1;
}

/** Returns path from start to goal (inclusive), or null if unreachable. */
function bfs(
  start: Point,
  goal: Point,
  cols: number,
  rows: number,
  obstacles: Set<string>,
): Point[] | null {
  if (obstacles.has(key(start))) return null;
  if (start.x === goal.x && start.y === goal.y) return [start];

  const visited = new Set<string>();
  visited.add(key(start));

  const queue: { pos: Point; path: Point[] }[] = [
    { pos: start, path: [start] },
  ];

  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;

    for (const dir of DIRECTIONS) {
      const next: Point = { x: pos.x + dir.x, y: pos.y + dir.y };
      const nk = key(next);

      if (!inBounds(next, cols, rows)) continue;
      if (obstacles.has(nk)) continue;
      if (visited.has(nk)) continue;

      const newPath = [...path, next];

      if (next.x === goal.x && next.y === goal.y) return newPath;

      visited.add(nk);
      queue.push({ pos: next, path: newPath });
    }
  }

  return null;
}

/** Count direction changes along a path. */
function countTurns(path: Point[]): number {
  if (path.length < 3) return 0;
  let turns = 0;
  let prevDx = path[1].x - path[0].x;
  let prevDy = path[1].y - path[0].y;
  for (let i = 2; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    if (dx !== prevDx || dy !== prevDy) {
      turns++;
      prevDx = dx;
      prevDy = dy;
    }
  }
  return turns;
}

/** Count cells on the path that are adjacent to a wall. */
function countWallHugs(path: Point[], cols: number, rows: number): number {
  let count = 0;
  for (const p of path) {
    if (isWallAdjacent(p, cols, rows)) count++;
  }
  return count;
}

interface ScoredDir {
  dir: Point;
  pathLen: number;
  wallHugs: number;
  turns: number;
}

/**
 * Unbeatable entertaining demo-mode AI.
 *
 * Tier 1: Safe food pursuit — find a move that can reach food via BFS
 * while guaranteeing the tail remains reachable for survival.
 * Tie-break for entertainment: prefer shorter paths, wall-hugging, more turns.
 *
 * Tier 2: Survival tail chase — find the move with the longest reachable
 * path to the tail (scenic route). Tie-break: prefer wall-adjacent new-head.
 *
 * Fallback: return the first valid move, biased toward food direction.
 */
export function getAIDirection(
  state: {
    snake: Point[];
    food: Point | null;
    direction: Point;
    score: number;
    alive: boolean;
    won: boolean;
  },
  cols: number,
  rows: number,
): Point {
  const { snake, food, direction } = state;
  const head = snake[0];
  const tail = snake[snake.length - 1];

  // ── Step 1: Collect valid immediate moves ──────────────────────

  const validMoves: { dir: Point; newHead: Point }[] = [];

  for (const dir of DIRECTIONS) {
    // Don't reverse
    if (isOpposite(dir, direction)) continue;

    const newHead: Point = { x: head.x + dir.x, y: head.y + dir.y };

    // Must be in bounds
    if (!inBounds(newHead, cols, rows)) continue;

    // Must not land on any current body cell (including tail — tail only
    // frees up after the step, and the engine checks self-collision first)
    const hitsBody = snake.some((s) => s.x === newHead.x && s.y === newHead.y);
    if (hitsBody) continue;

    validMoves.push({ dir, newHead });
  }

  if (validMoves.length === 0) return direction;
  if (validMoves.length === 1) return validMoves[0].dir;

  // ── Obstacle set for lookahead: body minus tail ───────────────
  // After one step, the tail cell becomes free and newHead is occupied.
  const bodyMinusTail = new Set<string>();
  for (let i = 0; i < snake.length - 1; i++) {
    bodyMinusTail.add(key(snake[i]));
  }

  // ── Step 2: Tier 1 — Safe Food Pursuit ────────────────────────

  if (food !== null) {
    const tier1: ScoredDir[] = [];

    for (const { dir, newHead } of validMoves) {
      // Can we reach food from the new head?
      const foodPath = bfs(newHead, food, cols, rows, bodyMinusTail);
      if (foodPath === null) continue;

      // Safety check: can we also reach the tail (retreat path)?
      const tailPath = bfs(newHead, tail, cols, rows, bodyMinusTail);
      if (tailPath === null) continue;

      tier1.push({
        dir,
        pathLen: foodPath.length,
        wallHugs: countWallHugs(foodPath, cols, rows),
        turns: countTurns(foodPath),
      });
    }

    if (tier1.length > 0) {
      // Entertainment sort: shorter path → more wall hugs → more turns
      tier1.sort((a, b) => {
        if (a.pathLen !== b.pathLen) return a.pathLen - b.pathLen;
        if (a.wallHugs !== b.wallHugs) return b.wallHugs - a.wallHugs;
        return b.turns - a.turns;
      });
      return tier1[0].dir;
    }
  }

  // ── Step 3: Tier 2 — Survival Tail Chase ──────────────────────

  {
    const tier2: ScoredDir[] = [];

    for (const { dir, newHead } of validMoves) {
      const tailPath = bfs(newHead, tail, cols, rows, bodyMinusTail);
      if (tailPath === null) continue;

      tier2.push({
        dir,
        pathLen: tailPath.length,
        wallHugs: isWallAdjacent(newHead, cols, rows) ? 1 : 0,
        turns: 0,
      });
    }

    if (tier2.length > 0) {
      // Prefer LONGEST path to tail (more scenic/entertaining)
      tier2.sort((a, b) => b.pathLen - a.pathLen);

      // Among ties, prefer wall-hugging newHead
      const bestLen = tier2[0].pathLen;
      const tied = tier2.filter((m) => m.pathLen === bestLen);
      if (tied.length > 1) {
        tied.sort((a, b) => b.wallHugs - a.wallHugs);
      }
      return tied[0].dir;
    }
  }

  // ── Step 4: Fallback — bias toward food for drama ─────────────

  if (food !== null) {
    validMoves.sort((a, b) => {
      const da =
        Math.abs(food.x - a.newHead.x) + Math.abs(food.y - a.newHead.y);
      const db =
        Math.abs(food.x - b.newHead.x) + Math.abs(food.y - b.newHead.y);
      return da - db;
    });
  }

  return validMoves[0].dir;
}
