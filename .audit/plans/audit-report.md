# Code Audit Report

**Project**: snakey (Phaser 3 Snake game)
**Date**: 2026-07-25
**Auditor**: Automated static analysis agent
**Scope**: Full codebase — 6-dimension audit

---

## Executive Summary

| Metric | Value |
|---|---|
| **Overall Health Score** | 7 / 10 |
| **Critical Issues** | 0 |
| **High Priority Issues** | 2 |
| **Medium Priority Issues** | 3 |
| **Low Priority Issues** | 6 |

### Top 3 Priorities
1. **Win-condition crash on full board** — Quality — `spawnFood()` assigns `undefined` food when no free cell exists; next move throws `TypeError` (`GameScene.ts:88` → `:138`).
2. **Zero tests + game logic welded to Phaser scene** — Testing/Architecture — no test files, no CI, and all rules (movement, collision, food spawn) are private methods on a rendering Scene, so they cannot be unit-tested headlessly.
3. **Geometry constants duplicated across files** — Architecture — canvas size lives in `main.ts:6-7`, grid math in `GameScene.ts:3-7`; they already disagree (border bottom edge renders at y=482 on a 480px canvas).

### What's Working Well
- **Clean toolchain**: `tsc --noEmit` passes with `strict: true`; `npm audit` reports 0 vulnerabilities; only 3 direct dependencies.
- **Zero security surface**: no network calls, no storage, no eval, no secrets, no DOM injection — verified by full-file reads and pattern sweeps.
- **Tidy code**: constants extracted, small single-purpose methods, correct 180°-reversal guard, no TODO/FIXME/dead code/debug statements anywhere.
- **No leaks**: input listeners registered once in `create()`, no `setInterval`/`setTimeout`, no manual `addEventListener`; Phaser manages the lifecycle.

---

## Findings

### 🔴 Critical

*None. Nothing exploitable, no data-loss path — this is a client-only game with no I/O.*

### 🟠 High Priority

#### [H-01] Crash when the board fills up (win condition)
- **File**: `src/scenes/GameScene.ts:88` (crash surfaces at `:138`)
- **Category**: Quality
- **Issue**: `spawnFood()` builds a `free` cell list; when the snake occupies all 660 cells the list is empty, `free[Math.floor(Math.random() * 0)]` evaluates to `free[0]` → `undefined`, and `this.food` becomes `undefined`. The next `moveSnake()` call evaluates `samePoint(newHead, this.food)`, which reads `.x` of `undefined`.
- **Impact**: Unhandled `TypeError: Cannot read properties of undefined` — the game hard-crashes at the exact moment the player wins. Rare in casual play (requires filling 660 cells) but 100% deterministic when reached, and it punishes the best possible player outcome.
- **Evidence**:
  ```ts
  // GameScene.ts:88
  this.food = free[Math.floor(Math.random() * free.length)];
  // GameScene.ts:138 — throws when this.food is undefined
  if (samePoint(newHead, this.food)) {
  ```
- **Recommendation**: Guard the empty case and treat it as a win, e.g.:
  ```ts
  if (free.length === 0) { this.win(); return; }
  ```
  (A minimal `win()` can mirror `die()` with different text, or reuse `die()`.)
- **Effort**: Small (<30 min)

#### [H-02] No automated tests; game rules are untestable as written
- **File**: `src/scenes/GameScene.ts` (whole file); repo root (no `*.test.ts`, no `__tests__`, no CI)
- **Category**: Testing
- **Issue**: Test-to-source ratio is 0:2. All game rules — `moveSnake()`, `spawnFood()`, `isOutOfBounds()`, `hitsSnake()`, the reversal guard in `handleInput()` — are private methods on a `Phaser.Scene` subclass that requires a DOM, canvas, and WebGL/canvas renderer to instantiate. None of the pure logic can be exercised in Node.
- **Impact**: Every change (including the H-01 fix) is verified only by manual play. Regressions in collision, scoring, or food spawning ship silently. This is the project's largest debt and it compounds as features (speed-up, high scores, pause) are added.
- **Evidence**:
  ```ts
  // GameScene.ts:122 — pure rule logic trapped inside a Phaser.Scene
  private moveSnake() {
    this.direction = this.nextDirection;
    const head = this.snake[0];
    ...
  ```
- **Recommendation**: Extract a framework-free `SnakeGame` engine (grid, snake, food, step(direction) → events) into `src/game/engine.ts`; keep `GameScene` as a thin renderer/input adapter. Then unit-test the engine with Vitest (fits the existing Vite toolchain). Cover: reversal rejection, wall death, self death, eat-and-grow, food never spawns on snake, full-board win.
- **Effort**: Large (1+ day including test suite)

### 🟡 Medium Priority

#### [M-01] No CI/CD pipeline
- **File**: repo root — no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`, `.travis.yml`, `bitbucket-pipelines.yml`
- **Category**: Maintainability
- **Issue**: Nothing runs `tsc` or `vite build` automatically on push/PR.
- **Impact**: Type errors or build breakage are only caught on the developer's machine; nothing gates merges.
- **Evidence**: `package.json:7` has `"build": "tsc && vite build"` but no automation invokes it.
- **Recommendation**: Add a minimal GitHub Actions workflow: `npm ci && npm run build` on push/PR (and `vitest run` once H-02 lands).
- **Effort**: Small (<30 min)

#### [M-02] No linter or formatter configured
- **File**: repo root — no `eslint.config.*`, `.eslintrc*`, `.prettierrc*`; ESLint/Prettier absent from `devDependencies`
- **Category**: Quality
- **Issue**: Code style and common bug patterns (unused vars, non-null-assertion overuse, floating promises) are enforced only by discipline.
- **Impact**: Inconsistency creep as the project grows; easy wins (e.g., flagging the `keyboard!` assertions in L-05) are missed.
- **Recommendation**: Add `eslint` + `typescript-eslint` (flat config) and optionally Prettier; wire `npm run lint` into the CI workflow from M-01.
- **Effort**: Small (<1 hr)

#### [M-03] Canvas size and grid geometry defined in two places — already drifting
- **File**: `src/main.ts:6-7` vs `src/scenes/GameScene.ts:3-7` and `:181`
- **Category**: Architecture
- **Issue**: `main.ts` hardcodes `width: 640, height: 480`; `GameScene` independently hardcodes `CELL/COLS/ROWS/OFFSET_X/OFFSET_Y`. The derived border rect is `strokeRect(18, 38, 604, 444)`, whose bottom edge lands at **y = 482 — two pixels below the 480px canvas** (`OFFSET_Y - 2 + ROWS * CELL + 4 = 38 + 440 + 4`). The two definitions have no shared source of truth.
- **Impact**: The bottom wall border is clipped off-screen today (see L-01); worse, any future change to grid size or canvas size silently misaligns rendering, input, and layout instead of failing loudly.
- **Evidence**:
  ```ts
  // main.ts:6-7        GameScene.ts:181
  width: 640,          g.strokeRect(OFFSET_X - 2, OFFSET_Y - 2, COLS * CELL + 4, ROWS * CELL + 4);
  height: 480,         // bottom edge = 38 + 440 + 4 = 482 > 480
  ```
- **Recommendation**: Export the geometry from one module (e.g. `src/config.ts`) and derive canvas size: `width = 2 * OFFSET_X + COLS * CELL`, `height = OFFSET_Y + ROWS * CELL + OFFSET_X`. Import it in both `main.ts` and `GameScene`.
- **Effort**: Small (<30 min)

### 🟢 Low Priority / Improvements

#### [L-01] Bottom border stroke rendered off-canvas
- **File**: `src/scenes/GameScene.ts:181`
- **Category**: Quality (visual)
- **Issue**: As detailed in M-03, the 2px border rect extends to y=482; the bottom wall is partially/fully clipped on the 480px canvas.
- **Impact**: Minor visual asymmetry — bottom wall thinner or invisible vs. the other three.
- **Recommendation**: Fixed automatically by M-03 (derive canvas from grid), or add 4px to canvas height.
- **Effort**: Small

#### [L-02] Single-slot input buffer drops rapid double-turns
- **File**: `src/scenes/GameScene.ts:149-160`
- **Category**: Quality (game feel)
- **Issue**: Only one `nextDirection` is buffered per 130ms tick, and `handleInput` uses an `else if` chain (left wins ties). A fast "up then left" within one tick loses the first input, making controls feel unresponsive at speed. Also, `update()` calls `handleInput()` even when dead (`:112` runs before the `:113` alive check) — harmless but wasteful.
- **Impact**: Input eaten during fast play; the classic snake complaint.
- **Recommendation**: Keep a small queue (length ≤ 2): validate each new input against the *last queued* direction, shift into `nextDirection` on each tick. Move `handleInput()` after the alive check or early-return when dead.
- **Effort**: Medium (1–2 hrs with testing)

#### [L-03] `spawnFood` rescans the whole board on every meal
- **File**: `src/scenes/GameScene.ts:81-89`
- **Category**: Performance
- **Issue**: Each spawn is O(COLS × ROWS × snake.length) — up to ~435k comparisons late-game. Negligible at this scale on modern hardware, but it's wasteful by construction.
- **Impact**: None observable today; becomes relevant only if grid/snake grow substantially.
- **Recommendation**: Maintain a `Set` of free cells (remove head cell on move, add tail cell on pop) and pick randomly from it; this also makes the H-01 guard a trivial `set.size === 0` check.
- **Effort**: Medium (best done together with H-02's engine extraction)

#### [L-04] No README or LICENSE
- **File**: repo root
- **Category**: Maintainability
- **Issue**: Nothing explains how to install/run/build, and no license terms exist.
- **Impact**: Friction for anyone cloning the repo; legally ambiguous for reuse.
- **Recommendation**: Add a short README (`npm install`, `npm run dev`, `npm run build`) and choose a license (MIT typical for games).
- **Effort**: Small

#### [L-05] Non-null assertions on keyboard plugin
- **File**: `src/scenes/GameScene.ts:43` and `:62` (`this.input.keyboard!`)
- **Category**: Quality
- **Issue**: `keyboard` is typed `KeyboardPlugin | null`; the `!` asserts it away. Safe under default Phaser config, but silently breaks if keyboard input is ever disabled in game config.
- **Impact**: Future config change → runtime crash instead of compile error.
- **Recommendation**: Guard once in `create()` (`const kb = this.input.keyboard; if (!kb) return;`) or keep and accept — low stakes either way.
- **Effort**: Small

#### [L-06] Score is session-only; no high-score persistence
- **File**: `src/scenes/GameScene.ts:31`, `:45`, `:139-140`
- **Category**: Quality (feature gap)
- **Issue**: Score resets every reload; no `localStorage` high score.
- **Impact**: Reduced replay motivation.
- **Recommendation**: Persist best score in `localStorage` on `die()`; display next to current score.
- **Effort**: Small

---

## Category Deep Dives

### 1. Architecture & Design
Two-module design: `main.ts` (13 lines, bootstraps `Phaser.Game`) → `GameScene.ts` (214 lines, everything else). Dependency graph is a straight line — no cycles possible. The structural weaknesses are (a) all rules living inside a rendering Scene, blocking headless testing (**H-02**), and (b) geometry defined twice with no shared source of truth, already producing the off-canvas border (**M-03**, **L-01**). The `Point` interface + `samePoint()` helper (`GameScene.ts:14-21`) show good instinct toward extracting pure logic — the engine extraction in H-02 follows that instinct further.

### 2. Code Quality
High for a project this size: strict TS passes clean, constants are named and hoisted (`GameScene.ts:3-12`), methods are short and single-purpose, no TODO/FIXME/HACK/BUG markers, no commented-out code, no debug statements. The only correctness defect found anywhere is the full-board food crash (**H-01**). No linter/formatter exists to keep it this way (**M-02**). Deepest nesting in the repo is 3 levels (the `spawnFood` double loop, `:83-87`) — well within healthy range; control-flow density is concentrated in `handleInput`/`moveSnake` but both remain readable.

### 3. Security
Essentially a zero-attack-surface application. Sweeps for hardcoded secrets, AWS/GitHub/OpenAI key patterns, private keys, `eval`/`Function`/shell execution, SQL string concatenation, `innerHTML`/`document.write`/XSS sinks, weak crypto (`md5`/`sha1`), TLS verification disables, CORS wildcards, CSRF suppressions, and JWT/session handling all returned **zero matches** — confirmed by complete reads of every source file. The game makes no network requests, uses no storage, and processes no user-supplied data. `npm audit` (moderate+) reports **0 vulnerabilities** across the phaser/vite/typescript tree. The only forward-looking note: `index.html` has no CSP meta tag — irrelevant for local dev, worth adding if the built game is ever hosted on a domain.

### 4. Performance
No N+1 patterns (no queries at all), no sync blocking (`readFileSync` etc. absent), no `time.sleep`, no leak indicators — event listeners are registered once in `create()` (`GameScene.ts:61-62`), and there are zero `setInterval`/`setTimeout`/manual `addEventListener` calls. Rendering does a full `graphics.clear()` + redraw per 130ms tick (`:168-176`); at ~50 primitives this is idiomatic Phaser and costs nothing. The only algorithmic note is `spawnFood`'s full-board rescan (**L-03**). No import bloat — two `import Phaser from "phaser"` statements and nothing else.

### 5. Testing
The weakest dimension by far: **0 test files, 0 assertions, 0 test blocks, 0 CI** (verified — no `*.test.*`/`*.spec.*`/`__tests__` anywhere, no workflow files). Ratio 0:2. Compounding factor is architectural: the logic worth testing is unreachable without a browser (**H-02**). Recommended path: extract engine → Vitest (native fit with the existing Vite setup) → cover the six rule cases listed in H-02 → gate via M-01's workflow.

### 6. Maintainability
Small surface area keeps maintenance cheap today, but the project lacks its guardrails: no CI (**M-01**), no lint (**M-02**), no README/LICENSE (**L-04**). Config surface is minimal and healthy — no environment variables, no dotenv, one 7-line `vite.config.ts`. Dependencies are minimal (3 direct) and all verifiably used (`depcheck` not run — it isn't installed and would require a network fetch; usage was confirmed by reading the imports instead).

---

## Prioritized Action Plan

### Quick Wins (< 1 day each)
- [ ] **[H-01]** `src/scenes/GameScene.ts:88` — Guard `free.length === 0` in `spawnFood()` and handle the win gracefully
- [ ] **[M-03]** `src/main.ts:6-7`, `src/scenes/GameScene.ts:3-7` — Move grid/canvas geometry into one shared `src/config.ts` and derive canvas size from it (fixes **L-01** border clipping as a side effect)
- [ ] **[M-01]** Add `.github/workflows/ci.yml` running `npm ci && npm run build`
- [ ] **[M-02]** Add ESLint (typescript-eslint, flat config) + `npm run lint`, wire into CI
- [ ] **[L-04]** Add README (install/dev/build) and LICENSE
- [ ] **[L-06]** Persist high score to `localStorage` in `die()`

### Medium-term (1–5 days each)
- [ ] **[H-02]** Extract framework-free `SnakeGame` engine to `src/game/engine.ts`; make `GameScene` a thin adapter; add Vitest with rule-coverage tests (reversal, wall, self, eat, spawn, win)
- [ ] **[L-02]** Replace single `nextDirection` slot with a 2-deep input queue validated against the last queued direction
- [ ] **[L-03]** Maintain a free-cell `Set` instead of rescanning the board in `spawnFood` (natural fit inside the H-02 engine)

### Strategic Initiatives (> 5 days)
- [ ] Feature roadmap on top of the extracted engine: speed ramp, pause, touch/swipe controls, sound — each becomes cheap and testable once H-02 lands
- [ ] If ever deployed publicly: add CSP meta to `index.html` and a deploy step to CI

---

## Metrics Dashboard

| Metric | Value |
|---|---|
| Files Analyzed | 8 (excl. `package-lock.json`, `node_modules`, `dist`) |
| Total Lines of Code | 264 |
| Languages Detected | TypeScript, HTML, JSON, Markdown |
| Test-to-Source File Ratio | 0:2 |
| Complexity Hotspots (files) | 1 (`GameScene.ts` — mild; max nesting 3 levels) |
| Security Findings | 🔴 0  🟠 0  🟡 0  🟢 0 (zero attack surface; npm audit clean) |
| TODO / FIXME / HACK Count | 0 / 0 / 0 |
| Direct Dependencies | 3 (`phaser ^3.87.0`, `typescript ~5.7.2`, `vite ^6.0.0`) |
| Avg File Length (LOC) | 33 (source files avg 62) |
| Longest File | `src/scenes/GameScene.ts` (214 lines) |
| Static Analysis Run | `tsc --noEmit` ✅ clean · `npm audit` ✅ 0 vulns · ESLint/Prettier/Vitest not configured |
