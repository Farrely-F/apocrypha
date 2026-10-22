import { describe, expect, it } from "vitest";
import { flagNewVault, hasSeen, markSeen, takePending, type Store } from "./storage";
import { activeSteps, pickAnchor, TOUR_STEPS } from "./steps";

function memory(): Store {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}
const broken: Store = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("pickAnchor", () => {
  it("skips elements that are hidden or collapsed", () => {
    const got = pickAnchor([
      { el: "xl-trigger", width: 0, height: 0 },
      { el: "icon-trigger", width: 28, height: 28 },
    ]);
    expect(got).toBe("icon-trigger");
  });
  it("returns null when nothing is on screen", () => {
    expect(pickAnchor([{ el: "a", width: 10, height: 0 }])).toBeNull();
    expect(pickAnchor([])).toBeNull();
  });
});

describe("activeSteps", () => {
  it("keeps centred steps and drops steps whose target is missing", () => {
    const present = new Set(["workspace", "palette", "lock"]);
    const ids = activeSteps(TOUR_STEPS, (t) => present.has(t)).map((s) => s.id);
    expect(ids).toEqual(["welcome", "workspace", "palette", "lock"]);
  });
  it("shows every step when every anchor exists", () => {
    expect(activeSteps(TOUR_STEPS, () => true)).toHaveLength(TOUR_STEPS.length);
  });
  it("has unique ids", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });
});

describe("tour trigger", () => {
  it("starts only for a vault flagged as new", () => {
    const session = memory();
    const local = memory();
    expect(takePending(session, local, "u1")).toBe(false);
    flagNewVault(session);
    expect(takePending(session, local, "u1")).toBe(true);
  });
  it("fires once: the flag is spent even if the tour is not finished", () => {
    const session = memory();
    const local = memory();
    flagNewVault(session);
    expect(takePending(session, local, "u1")).toBe(true);
    expect(takePending(session, local, "u1")).toBe(false);
  });
  it("never replays for a user who has seen it", () => {
    const session = memory();
    const local = memory();
    markSeen(local, "u1");
    flagNewVault(session);
    expect(takePending(session, local, "u1")).toBe(false);
    expect(hasSeen(local, "u1")).toBe(true);
    expect(hasSeen(local, "u2")).toBe(false);
  });
  it("does nothing, and does not throw, when storage is blocked", () => {
    flagNewVault(broken);
    markSeen(broken, "u1");
    expect(hasSeen(broken, "u1")).toBe(false);
    expect(takePending(broken, broken, "u1")).toBe(false);
  });
});

import { dockEdge, placeCard } from "./place";

describe("placeCard", () => {
  const view = { w: 1280, h: 800 };
  const card = { w: 352, h: 220 };
  it("centres a card with no target", () => {
    expect(placeCard(null, card, view)).toEqual({ left: 464, top: 290 });
  });
  it("sits below the target, centred on it", () => {
    const p = placeCard({ x: 600, y: 100, w: 80, h: 32 }, card, view);
    expect(p.top).toBe(146);
    expect(p.left).toBe(640 - 176);
  });
  it("flips above when there is no room below", () => {
    const p = placeCard({ x: 600, y: 700, w: 80, h: 32 }, card, view);
    expect(p.top).toBe(700 - 14 - 220);
  });
  it("keeps the card inside the viewport at the right edge", () => {
    const p = placeCard({ x: 1240, y: 100, w: 30, h: 30 }, card, view);
    expect(p.left).toBe(1280 - 352 - 16);
  });
  it("pins to the bottom when the target is taller than either side", () => {
    const p = placeCard({ x: 100, y: 60, w: 1000, h: 700 }, card, view);
    expect(p.top).toBe(800 - 220 - 16);
  });
});

describe("dockEdge", () => {
  it("docks away from the target on a phone", () => {
    expect(dockEdge({ x: 0, y: 40, w: 100, h: 30 }, 800)).toBe("bottom");
    expect(dockEdge({ x: 0, y: 740, w: 100, h: 30 }, 800)).toBe("top");
    expect(dockEdge(null, 800)).toBe("bottom");
  });
});
