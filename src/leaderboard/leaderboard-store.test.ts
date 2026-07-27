import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getLeaderboard, __resetMemo } from "./leaderboard-store";
import { SEED } from "./leaderboard-core";
import { NAME_COUNT } from "./names";

/* ──────────── Helpers ──────────── */

interface MockStorage {
  data: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
  key: (i: number) => string | null;
  readonly length: number;
}

function makeMockStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => {
      data.clear();
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
}

function installStorage(storage: MockStorage): void {
  vi.stubGlobal("localStorage", storage);
}

/* ──────────── Tests ──────────── */

describe("getLeaderboard", () => {
  beforeEach(() => {
    __resetMemo();
    installStorage(makeMockStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ~NAME_COUNT rows on first call (no persisted doc)", () => {
    const rows = getLeaderboard();
    expect(rows.length).toBeGreaterThanOrEqual(NAME_COUNT - 1);
    expect(rows.length).toBeLessThanOrEqual(NAME_COUNT);
    // No player score → no YOU row
    expect(rows.some((r) => r.isPlayer)).toBe(false);
  });

  it("persists the NPC doc to localStorage on first call", () => {
    getLeaderboard();
    const raw = localStorage.getItem("snakey-leaderboard");
    expect(raw).not.toBeNull();
    const doc = JSON.parse(raw as string);
    expect(doc.version).toBe(1);
    expect(doc.seed).toBe(SEED);
    expect(Array.isArray(doc.entries)).toBe(true);
    expect(doc.entries.length).toBe(NAME_COUNT);
  });

  it("memoizes the parsed doc across calls within the same session", () => {
    getLeaderboard();
    const first = getLeaderboard();
    const second = getLeaderboard();
    expect(first).toEqual(second);
  });

  it("includes a YOU row when 'snakey-best-score' is set", () => {
    localStorage.setItem("snakey-best-score", "999");
    const rows = getLeaderboard();
    const player = rows.find((r) => r.isPlayer);
    expect(player).toBeDefined();
    expect(player!.score).toBe(999);
    // A score of 999 should land YOU at the very top
    expect(rows[0].isPlayer).toBe(true);
    expect(rows[0].sortRank).toBe(1);
  });

  it("omits YOU when best score is 0 or unset", () => {
    expect(getLeaderboard().some((r) => r.isPlayer)).toBe(false);
    localStorage.setItem("snakey-best-score", "0");
    __resetMemo();
    expect(getLeaderboard().some((r) => r.isPlayer)).toBe(false);
  });

  it("treats non-numeric best score as 0", () => {
    localStorage.setItem("snakey-best-score", "not-a-number");
    const rows = getLeaderboard();
    expect(rows.some((r) => r.isPlayer)).toBe(false);
  });

  it("regenerates the doc when stored version is outdated", () => {
    localStorage.setItem(
      "snakey-leaderboard",
      JSON.stringify({
        version: 0, // intentionally wrong
        seed: SEED,
        generatedAt: 0,
        entries: [],
      }),
    );
    __resetMemo();
    const rows = getLeaderboard();
    expect(rows.length).toBe(NAME_COUNT);
    // First run also writes a fresh doc.
    const raw = JSON.parse(localStorage.getItem("snakey-leaderboard") as string);
    expect(raw.version).toBe(1);
  });

  it("regenerates the doc when stored seed differs", () => {
    localStorage.setItem(
      "snakey-leaderboard",
      JSON.stringify({
        version: 1,
        seed: 999, // wrong seed
        generatedAt: 0,
        entries: [],
      }),
    );
    __resetMemo();
    const rows = getLeaderboard();
    expect(rows.length).toBe(NAME_COUNT);
  });

  it("regenerates the doc when stored entries is empty", () => {
    localStorage.setItem(
      "snakey-leaderboard",
      JSON.stringify({
        version: 1,
        seed: SEED,
        generatedAt: 0,
        entries: [],
      }),
    );
    __resetMemo();
    const rows = getLeaderboard();
    expect(rows.length).toBe(NAME_COUNT);
  });

  it("recovers from a corrupted localStorage JSON", () => {
    localStorage.setItem("snakey-leaderboard", "{not-json");
    __resetMemo();
    expect(() => getLeaderboard()).not.toThrow();
    expect(getLeaderboard().length).toBe(NAME_COUNT);
  });

  it("works when localStorage is undefined (Safari private mode)", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => getLeaderboard()).not.toThrow();
    const rows = getLeaderboard();
    expect(rows.length).toBe(NAME_COUNT);
  });

  it("works when localStorage.setItem throws", () => {
    const throwing = makeMockStorage();
    throwing.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    installStorage(throwing);
    expect(() => getLeaderboard()).not.toThrow();
    expect(getLeaderboard().length).toBeGreaterThanOrEqual(NAME_COUNT - 1);
  });
});

describe("__resetMemo", () => {
  beforeEach(() => {
    __resetMemo();
    installStorage(makeMockStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces a fresh read from localStorage on next getLeaderboard", () => {
    // Seed with a tiny doc that we can identify by an NPC score.
    localStorage.setItem(
      "snakey-leaderboard",
      JSON.stringify({
        version: 1,
        seed: SEED,
        generatedAt: 0,
        entries: [
          { rank: 1, name: "TopNPC", score: 1000 },
        ],
      }),
    );
    // First call memoizes the one-entry doc.
    const firstRows = getLeaderboard();
    expect(firstRows.length).toBe(1);

    // Replace localStorage with the real SEED-derived doc but DON'T reset memo.
    localStorage.clear();
    const regenerated = getLeaderboard();
    // Still 1 — memo hasn't been invalidated.
    expect(regenerated.length).toBe(firstRows.length);

    // After reset, the doc is reloaded from storage and rebuilt.
    __resetMemo();
    localStorage.clear();
    const fresh = getLeaderboard();
    expect(fresh.length).toBe(NAME_COUNT);
  });
});
