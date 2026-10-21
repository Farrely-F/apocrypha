import { describe, expect, it } from "vitest";
import { FRESH_SIGN_IN_MS, signedInRecently } from "./fresh";

describe("signedInRecently", () => {
  const now = Date.UTC(2026, 9, 21, 12, 0, 0);
  it("accepts a recent sign-in and refuses an old or odd one", () => {
    expect(signedInRecently({ createdAt: new Date(now - 60_000) }, now)).toBe(true);
    expect(signedInRecently({ createdAt: new Date(now - FRESH_SIGN_IN_MS - 1) }, now)).toBe(false);
    expect(signedInRecently({ createdAt: "not a date" }, now)).toBe(false);
    expect(signedInRecently({ createdAt: new Date(now + 3_600_000) }, now)).toBe(false);
  });
});
