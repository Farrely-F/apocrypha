import { describe, expect, it } from "vitest";
import { createVaultSchema, recoveryConfirmSchema, unlockSchema } from "./schemas";

const errs = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

describe("createVaultSchema", () => {
  const good = { passphrase: "correct horse battery staple", confirm: "correct horse battery staple" };

  it("accepts a strong matching passphrase", () => {
    expect(createVaultSchema.safeParse(good).success).toBe(true);
  });

  it("explains a short or weak passphrase on the passphrase field", () => {
    const r = createVaultSchema.safeParse({ passphrase: "short", confirm: "short" });
    expect(r.success).toBe(false);
    expect(errs(r).passphrase).toMatch(/12 characters/);
    const w = createVaultSchema.safeParse({ passphrase: "Password12345", confirm: "Password12345" });
    expect(errs(w).passphrase).toMatch(/common/i);
  });

  it("reports a mismatch on the confirm field, not the passphrase", () => {
    const r = createVaultSchema.safeParse({ ...good, confirm: "something else entirely" });
    expect(errs(r).confirm).toMatch(/don't match/);
    expect(errs(r).passphrase).toBeUndefined();
  });

  it("does not trim: spaces are part of a passphrase", () => {
    const p = "  spaced out passphrase  ";
    expect(createVaultSchema.safeParse({ passphrase: p, confirm: p }).success).toBe(true);
    expect(createVaultSchema.safeParse({ passphrase: p, confirm: p.trim() }).success).toBe(false);
  });
});

describe("recoveryConfirmSchema", () => {
  const schema = recoveryConfirmSchema("QE4N-AEQ1-CZ04-9RQ0");
  it("wants the last four characters, ignoring case and dashes", () => {
    for (const ok of ["9RQ0", "9rq0", " 9r-q0 "]) expect(schema.safeParse({ typed: ok }).success).toBe(true);
  });
  it("refuses anything else", () => {
    for (const bad of ["", "9RQ", "ABCD", "CZ04", "QE4N-AEQ1-CZ04-9RQ0x"]) {
      expect(schema.safeParse({ typed: bad }).success).toBe(false);
    }
  });
});

describe("unlockSchema", () => {
  it("needs a passphrase, and carries the trust choice", () => {
    expect(unlockSchema.safeParse({ passphrase: "", trust: false }).success).toBe(false);
    const r = unlockSchema.safeParse({ passphrase: "x", trust: true });
    expect(r.success && r.data).toEqual({ passphrase: "x", trust: true });
  });
});
