import { describe, it, expect } from "vitest";
import {
  scoreCurveBase,
  generateNpcEntries,
  mergeWithPlayer,
  truncateName,
  formatRow,
  SEED,
  SCORE_MAX,
  SCORE_MIN,
  JITTER_AMP,
  NAME_DISPLAY_MAX,
} from "./leaderboard-core";
import type { LeaderboardRow, NpcEntry } from "./leaderboard-core";
import { NAMES, NAME_COUNT } from "./names";

describe("scoreCurveBase", () => {
  it("returns SCORE_MAX for rank 1", () => {
    expect(scoreCurveBase(1)).toBe(SCORE_MAX);
  });

  it("returns SCORE_MIN for the last rank", () => {
    expect(scoreCurveBase(NAME_COUNT)).toBe(SCORE_MIN);
  });

  it("decreases monotonically with rank", () => {
    let prev = scoreCurveBase(1);
    for (let r = 2; r <= NAME_COUNT; r++) {
      const v = scoreCurveBase(r);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("keeps every value within [SCORE_MIN, SCORE_MAX]", () => {
    for (let r = 1; r <= NAME_COUNT; r++) {
      const v = scoreCurveBase(r);
      expect(v).toBeGreaterThanOrEqual(SCORE_MIN);
      expect(v).toBeLessThanOrEqual(SCORE_MAX);
    }
  });

  it("does not throw — input validation is upstream", () => {
    // scoreCurveBase is a pure math helper; callers (e.g. generateNpcEntries)
    // are responsible for passing valid ranks in [1, NAME_COUNT].
    expect(() => scoreCurveBase(1)).not.toThrow();
    expect(() => scoreCurveBase(NAME_COUNT)).not.toThrow();
  });
});

describe("generateNpcEntries", () => {
  it("produces NAME_COUNT entries", () => {
    const entries = generateNpcEntries(SEED);
    expect(entries.length).toBe(NAME_COUNT);
  });

  it("uses names in NAMES order (rank 1 first, rank N last)", () => {
    const entries = generateNpcEntries(SEED);
    expect(entries[0].name).toBe(NAMES[0]);
    expect(entries[NAME_COUNT - 1].name).toBe(NAMES[NAME_COUNT - 1]);
  });

  it("assigns rank = index + 1", () => {
    const entries = generateNpcEntries(SEED);
    entries.forEach((e, i) => {
      expect(e.rank).toBe(i + 1);
    });
  });

  it("is deterministic from the same seed", () => {
    const a = generateNpcEntries(SEED);
    const b = generateNpcEntries(SEED);
    expect(a).toEqual(b);
  });

  it("produces different outputs from different seeds", () => {
    const a = generateNpcEntries(123);
    const b = generateNpcEntries(456);
    expect(a).not.toEqual(b);
  });

  it("keeps every score >= 1 and within a tight band of the curve", () => {
    const entries = generateNpcEntries(SEED);
    for (const e of entries) {
      // Curve base is in [SCORE_MIN, SCORE_MAX]; jitter is ±JITTER_AMP,
      // but Math.max(1, ...) keeps minimum at 1.
      expect(e.score).toBeGreaterThanOrEqual(1);
      const base = scoreCurveBase(e.rank);
      expect(e.score).toBeGreaterThanOrEqual(base - JITTER_AMP);
      expect(e.score).toBeLessThanOrEqual(base + JITTER_AMP);
    }
  });
});

describe("mergeWithPlayer", () => {
  const npc: NpcEntry[] = [
    { rank: 1, name: "Top", score: 500 },
    { rank: 2, name: "Mid", score: 200 },
    { rank: 3, name: "Low", score: 50 },
  ];

  it("returns NPC rows sorted descending by score when player is null", () => {
    const rows = mergeWithPlayer(npc, null);
    expect(rows.map((r) => r.score)).toEqual([500, 200, 50]);
    expect(rows.every((r) => !r.isPlayer)).toBe(true);
  });

  it("omits the player row when player.score is 0", () => {
    const rows = mergeWithPlayer(npc, { name: "YOU", score: 0 });
    expect(rows.length).toBe(npc.length);
    expect(rows.some((r) => r.isPlayer)).toBe(false);
  });

  it("inserts YOU and re-sorts when player score beats some NPCs", () => {
    const rows = mergeWithPlayer(npc, { name: "YOU", score: 300 });
    expect(rows.map((r) => r.score)).toEqual([500, 300, 200, 50]);
    const player = rows.find((r) => r.isPlayer);
    expect(player).toBeDefined();
    expect(player!.sortRank).toBe(2);
  });

  it("places YOU at the top when player score exceeds all NPCs", () => {
    const rows = mergeWithPlayer(npc, { name: "YOU", score: 999 });
    expect(rows[0].isPlayer).toBe(true);
    expect(rows[0].score).toBe(999);
  });

  it("places YOU first when tied with the top NPC", () => {
    const rows = mergeWithPlayer(npc, { name: "YOU", score: 500 });
    expect(rows[0].isPlayer).toBe(true);
    expect(rows[1].isPlayer).toBe(false);
    expect(rows[1].score).toBe(500);
  });

  it("assigns sortRank 1..N sequentially after sort", () => {
    const rows = mergeWithPlayer(npc, { name: "YOU", score: 999 });
    rows.forEach((r, i) => {
      expect(r.sortRank).toBe(i + 1);
    });
  });

  it("sets powerRank to null for YOU and preserves it for NPCs", () => {
    const rows = mergeWithPlayer(npc, { name: "YOU", score: 200 });
    rows.forEach((r) => {
      if (r.isPlayer) {
        expect(r.powerRank).toBeNull();
        expect(r.name).toBe("YOU");
      } else {
        expect(typeof r.powerRank).toBe("number");
      }
    });
  });
});

describe("truncateName", () => {
  it("returns the name unchanged when shorter than max", () => {
    expect(truncateName("Bob")).toBe("Bob");
  });

  it("returns the name unchanged when exactly at max", () => {
    const name = "a".repeat(NAME_DISPLAY_MAX);
    expect(truncateName(name)).toBe(name);
  });

  it("truncates with horizontal-ellipsis suffix", () => {
    const longName = "This Is A Very Long Name Indeed";
    const result = truncateName(longName);
    expect(result.length).toBe(NAME_DISPLAY_MAX);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("honors a custom max parameter", () => {
    expect(truncateName("Hello World", 5)).toBe("Hell\u2026");
    expect(truncateName("Hi", 5)).toBe("Hi");
  });
});

describe("formatRow", () => {
  it("prefixes NPC rows with two spaces (no marker)", () => {
    const row: LeaderboardRow = {
      sortRank: 3,
      score: 100,
      isPlayer: false,
      name: "Bob",
      powerRank: 5,
    };
    const out = formatRow(row);
    expect(out.startsWith("  ")).toBe(true);
    expect(out).not.toContain("(YOU)");
  });

  it("prefixes YOU rows with ▶ and suffixes (YOU)", () => {
    const row: LeaderboardRow = {
      sortRank: 1,
      score: 999,
      isPlayer: true,
      name: "YOU",
      powerRank: null,
    };
    const out = formatRow(row);
    expect(out.startsWith("\u25B6 ")).toBe(true);
    expect(out.endsWith("(YOU)")).toBe(true);
  });

  it("pads sortRank to 2 chars with dot separator", () => {
    const row: LeaderboardRow = {
      sortRank: 7,
      score: 1,
      isPlayer: false,
      name: "X",
      powerRank: 100,
    };
    expect(formatRow(row)).toContain(" 7.");
  });

  it("right-aligns score to 4 chars", () => {
    const row: LeaderboardRow = {
      sortRank: 1,
      score: 7,
      isPlayer: false,
      name: "X",
      powerRank: 100,
    };
    expect(formatRow(row)).toMatch(/   7\b/);
  });
});

describe("NAMES constants", () => {
  it("has 68 entries (matches NAME_COUNT)", () => {
    expect(NAMES.length).toBe(68);
    expect(NAME_COUNT).toBe(68);
  });

  it("preserves the documented 'Georgep Gervin' typo intentionally", () => {
    // This is a known, flagged typo per names.ts comment.
    // If someone fixes it later, this test will intentionally break and force
    // a discussion rather than silent auto-correction.
    expect(NAMES).toContain("Georgep Gervin");
  });
});
