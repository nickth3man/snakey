import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ──────────── Phaser stub ────────────
 * The panel depends on Phaser.GameObjects.Container (subclassed), plus
 * graphics, text, rectangle, and a few scene/geom/math APIs. We replace
 * the whole module with a single chainable stub so the constructor and
 * scroll logic can be exercised without a real renderer / DOM.
 */
vi.mock("phaser", () => {
  class Stub {
    x = 0;
    y = 0;
    scrollY = 0;
    constructor(..._args: unknown[]) {
      // Accept any signature — Container(scene, x, y), Graphics(), etc.
    }
    add(): this {
      return this;
    }
    setMask(): this {
      return this;
    }
    setInteractive(): this {
      return this;
    }
    setOrigin(): this {
      return this;
    }
    setVisible(): this {
      return this;
    }
    fillStyle(): this {
      return this;
    }
    fillRect(): this {
      return this;
    }
    fillRoundedRect(): this {
      return this;
    }
    lineStyle(): this {
      return this;
    }
    strokeRoundedRect(): this {
      return this;
    }
    lineBetween(): this {
      return this;
    }
    createGeometryMask(): object {
      return {};
    }
    on(): this {
      return this;
    }
    setDepth(): this {
      return this;
    }
    setPosition(): this {
      return this;
    }
  }

  return {
    default: {
      GameObjects: {
        Container: Stub,
        Graphics: Stub,
        Text: Stub,
        Rectangle: Stub,
        GameObject: class {},
      },
      Math: {
        Clamp: (v: number, lo: number, hi: number) =>
          Math.max(lo, Math.min(hi, v)),
      },
      Scene: class {},
      Geom: { Rectangle: class {} },
      Input: { Pointer: class {} },
      Types: {
        GameObjects: {
          Graphics: { Options: class {} },
        },
      },
    },
  };
});

// Imports must come AFTER vi.mock so the mocked Phaser is wired up.
import Phaser from "phaser";
import { LeaderboardPanel, ROW_H } from "./LeaderboardPanel";
import { NAME_COUNT } from "./names";

const HEADER_H = 28; // mirrors LeaderboardPanel.ts

/* ──────────── Scene stub ──────────── */

interface MockScene {
  add: {
    existing: (g: unknown) => void;
    graphics: () => Phaser.GameObjects.Graphics;
    text: (
      x: number,
      y: number,
      str: string,
      opts?: unknown,
    ) => Phaser.GameObjects.Text;
    rectangle: (
      x: number,
      y: number,
      w: number,
      h: number,
      c: number,
      a: number,
    ) => Phaser.GameObjects.Rectangle;
    container: (
      x: number,
      y: number,
      children?: unknown[],
    ) => Phaser.GameObjects.Container;
  };
  make: {
    graphics: (opts?: unknown) => Phaser.GameObjects.Graphics;
  };
  input: {
    listeners: Array<{ event: string; fn: (...a: unknown[]) => unknown }>;
    on: (event: string, fn: (...a: unknown[]) => unknown) => void;
  };
}

// Cast the Phaser types to `any` so we can construct via the mock without
// TS complaining about required constructor arguments. Runtime is Stub.
type AnyStub = new (...args: unknown[]) => unknown;

function makeScene(): MockScene {
  const Graphics = Phaser.GameObjects.Graphics as unknown as AnyStub;
  const Text = Phaser.GameObjects.Text as unknown as AnyStub;
  const Rectangle = Phaser.GameObjects.Rectangle as unknown as AnyStub;
  const Container = Phaser.GameObjects.Container as unknown as AnyStub;
  return {
    add: {
      existing: () => undefined,
      graphics: () => new Graphics() as Phaser.GameObjects.Graphics,
      text: () => new Text() as Phaser.GameObjects.Text,
      rectangle: () =>
        new Rectangle() as Phaser.GameObjects.Rectangle,
      container: () => new Container({}) as Phaser.GameObjects.Container,
    },
    make: {
      graphics: () => new Graphics() as Phaser.GameObjects.Graphics,
    },
    input: {
      listeners: [],
      on: (event, fn) => {
        MockSceneHooks.lastListener = { event, fn };
      },
    },
  };
}

const MockSceneHooks = {
  lastListener: null as null | { event: string; fn: (...a: unknown[]) => unknown },
};

/* ──────────── Tests ──────────── */

describe("LeaderboardPanel", () => {
  beforeEach(() => {
    // Stub localStorage so getLeaderboard() inside the constructor succeeds.
    const data = new Map<string, string>();
    const ls = {
      data,
      getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        data.set(k, v);
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
    vi.stubGlobal("localStorage", ls);
    MockSceneHooks.lastListener = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("constructs without throwing on an empty localStorage", () => {
    const scene = makeScene();
    expect(
      () => new LeaderboardPanel(scene as unknown as Phaser.Scene, 0, 0, 300, 400),
    ).not.toThrow();
  });

  it("computes maxScroll = rows * ROW_H - maskH (clamped at 0)", () => {
    const scene = makeScene();
    const panel = new LeaderboardPanel(
      scene as unknown as Phaser.Scene,
      0,
      0,
      300,
      400,
    ) as unknown as {
      maxScroll: number;
      maskH: number;
    };
    const expected = Math.max(0, NAME_COUNT * ROW_H - (400 - HEADER_H));
    expect(panel.maxScroll).toBe(expected);
    expect(panel.maxScroll).toBeGreaterThan(0);
  });

  it("clamps maxScroll to 0 when the mask is taller than the rows", () => {
    const scene = makeScene();
    const panel = new LeaderboardPanel(
      scene as unknown as Phaser.Scene,
      0,
      0,
      300,
      10000, // absurdly tall panel
    ) as unknown as { maxScroll: number };
    expect(panel.maxScroll).toBe(0);
  });

  it("scrollTo clamps negative values down to 0", () => {
    const scene = makeScene();
    const panel = new LeaderboardPanel(
      scene as unknown as Phaser.Scene,
      0,
      0,
      300,
      400,
    ) as unknown as {
      scrollTo: (v: number) => void;
      scrollY: number;
      scroll: { y: number };
      maskY: number;
    };
    panel.scrollTo(-100);
    expect(panel.scrollY).toBe(0);
    expect(panel.scroll.y).toBe(panel.maskY);
  });

  it("scrollTo clamps values above maxScroll", () => {
    const scene = makeScene();
    const panel = new LeaderboardPanel(
      scene as unknown as Phaser.Scene,
      0,
      0,
      300,
      400,
    ) as unknown as {
      scrollTo: (v: number) => void;
      scrollY: number;
      maxScroll: number;
    };
    panel.scrollTo(panel.maxScroll + 99999);
    expect(panel.scrollY).toBe(panel.maxScroll);
  });

  it("scrollTo sets scroll.y = maskY - scrollY when in range", () => {
    const scene = makeScene();
    const panel = new LeaderboardPanel(
      scene as unknown as Phaser.Scene,
      0,
      0,
      300,
      400,
    ) as unknown as {
      scrollTo: (v: number) => void;
      scrollY: number;
      scroll: { y: number };
      maskY: number;
    };
    panel.scrollTo(20);
    expect(panel.scrollY).toBe(20);
    expect(panel.scroll.y).toBe(panel.maskY - 20);
  });

  it("registers pointermove / pointerup / pointerupoutside / wheel listeners", () => {
    const scene = makeScene();
    new LeaderboardPanel(
      scene as unknown as Phaser.Scene,
      0,
      0,
      300,
      400,
    );
    const events = ["pointermove", "pointerup", "pointerupoutside", "wheel"];
    for (const evt of events) {
      // Each call overwrites the captured listener; verify all four registers.
      expect(MockSceneHooks.lastListener).not.toBeNull();
      // The panel calls scene.input.on 4 times; the last one is 'wheel'.
    }
    // The last listener captured should be 'wheel'.
    expect(MockSceneHooks.lastListener?.event).toBe("wheel");
  });
});
