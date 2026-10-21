import { describe, expect, it } from "vitest";
import { MIN_PASSPHRASE_LENGTH, passphraseStrength } from "./strength";

describe("passphraseStrength", () => {
  it("rejects anything under the minimum length", () => {
    const r = passphraseStrength("Ab1!xyz");
    expect(r.ok).toBe(false);
    expect(r.level).toBe("short");
    expect(MIN_PASSPHRASE_LENGTH).toBe(12);
  });

  it("rejects long but repetitive passphrases", () => {
    expect(passphraseStrength("aaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(passphraseStrength("abababababababababab").ok).toBe(false);
  });

  it("rejects common patterns even when padded", () => {
    expect(passphraseStrength("Password12345").ok).toBe(false);
    expect(passphraseStrength("qwertyuiop1234").ok).toBe(false);
    expect(passphraseStrength("apocrypha-apocrypha").ok).toBe(false);
  });

  it("accepts a multi-word passphrase and a random mixed one", () => {
    expect(passphraseStrength("correct horse battery staple").ok).toBe(true);
    expect(passphraseStrength("kT9#vLq2!xWm4").ok).toBe(true);
  });

  it("grades monotonically with strength", () => {
    const order = ["short", "weak", "fair", "strong"];
    const a = order.indexOf(passphraseStrength("kT9#vLq2!xWm4").level);
    const b = order.indexOf(passphraseStrength("correct horse battery staple").level);
    expect(a).toBeGreaterThanOrEqual(order.indexOf("fair"));
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("always explains what to change", () => {
    expect(passphraseStrength("short").hint.length).toBeGreaterThan(0);
    expect(passphraseStrength("correct horse battery staple").hint.length).toBeGreaterThan(0);
  });
});
