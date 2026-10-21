import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair } from "../crypto";
import {
  clearSession,
  DEFAULT_IDLE_MS,
  isExpired,
  loadSession,
  onVaultEvent,
  parseIdleMs,
  saveSession,
  touchSession,
  TRUST_TTL_MS,
  type StoredSession,
  announce,
} from "./keystore";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

async function pair() {
  // The same shape unlockVault returns: a non-extractable private key.
  return generateKeyPair({ extractable: false });
}

beforeEach(async () => {
  await clearSession();
});

describe("parseIdleMs", () => {
  it("defaults to 15 minutes", () => {
    expect(DEFAULT_IDLE_MS).toBe(15 * MIN);
    expect(parseIdleMs(undefined)).toBe(15 * MIN);
    expect(parseIdleMs("")).toBe(15 * MIN);
  });
  it("accepts a positive override and rejects junk", () => {
    expect(parseIdleMs("4000")).toBe(4000);
    expect(parseIdleMs("0")).toBe(15 * MIN);
    expect(parseIdleMs("-5")).toBe(15 * MIN);
    expect(parseIdleMs("soon")).toBe(15 * MIN);
  });
});

describe("isExpired", () => {
  const base: StoredSession = {
    keyPair: null as never,
    trusted: false,
    unlockedAt: T0,
    lastActive: T0,
    expiresAt: null,
  };
  it("idles out after the idle window when not trusted", () => {
    expect(isExpired(base, T0 + 15 * MIN - 1, 15 * MIN)).toBe(false);
    expect(isExpired(base, T0 + 15 * MIN, 15 * MIN)).toBe(true);
  });
  it("ignores idleness when trusted, and expires only at the absolute time", () => {
    const t = { ...base, trusted: true, expiresAt: T0 + TRUST_TTL_MS };
    expect(isExpired(t, T0 + 3 * 24 * 60 * MIN, 15 * MIN)).toBe(false);
    expect(isExpired(t, T0 + TRUST_TTL_MS, 15 * MIN)).toBe(true);
  });
  it("treats a trusted record with no or absurd expiry as expired", () => {
    expect(isExpired({ ...base, trusted: true, expiresAt: null }, T0, 15 * MIN)).toBe(true);
    expect(
      isExpired({ ...base, trusted: true, expiresAt: T0 + 2 * TRUST_TTL_MS }, T0, 15 * MIN),
    ).toBe(true);
  });
});

describe("session persistence", () => {
  it("round-trips a non-extractable key pair through IndexedDB", async () => {
    const kp = await pair();
    await saveSession(kp, { trusted: false, now: T0 });
    const got = await loadSession({ now: T0 + 1000, idleMs: 15 * MIN });
    expect(got).not.toBeNull();
    expect(got!.keyPair.publicKey).toBe(kp.publicKey);
    expect(got!.keyPair.alg).toBe(kp.alg);
    expect(got!.keyPair.privateKey.extractable).toBe(false);
    expect(got!.keyPair.privateKey.type).toBe("private");
    await expect(
      globalThis.crypto.subtle.exportKey("pkcs8", got!.keyPair.privateKey),
    ).rejects.toThrow();
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadSession({ now: T0, idleMs: 15 * MIN })).toBeNull();
  });

  it("wipes an idle-expired session on load", async () => {
    await saveSession(await pair(), { trusted: false, now: T0 });
    expect(await loadSession({ now: T0 + 16 * MIN, idleMs: 15 * MIN })).toBeNull();
    // Gone for good, even if the clock is read as earlier afterwards.
    expect(await loadSession({ now: T0 + 1, idleMs: 15 * MIN })).toBeNull();
  });

  it("touch extends the idle window and survives across loads", async () => {
    await saveSession(await pair(), { trusted: false, now: T0 });
    expect(await touchSession({ now: T0 + 10 * MIN, idleMs: 15 * MIN })).toBe(true);
    expect(await loadSession({ now: T0 + 20 * MIN, idleMs: 15 * MIN })).not.toBeNull();
    expect(await loadSession({ now: T0 + 26 * MIN, idleMs: 15 * MIN })).toBeNull();
  });

  it("touch never revives an expired session", async () => {
    await saveSession(await pair(), { trusted: false, now: T0 });
    expect(await touchSession({ now: T0 + 16 * MIN, idleMs: 15 * MIN })).toBe(false);
    expect(await loadSession({ now: T0 + 16 * MIN, idleMs: 15 * MIN })).toBeNull();
  });

  it("touch on an empty store is false", async () => {
    expect(await touchSession({ now: T0, idleMs: 15 * MIN })).toBe(false);
  });

  it("trusted sessions skip idle lock but die at 7 days", async () => {
    await saveSession(await pair(), { trusted: true, now: T0 });
    const day = 24 * 60 * MIN;
    const s = await loadSession({ now: T0 + 6 * day, idleMs: 15 * MIN });
    expect(s?.trusted).toBe(true);
    expect(s?.expiresAt).toBe(T0 + 7 * day);
    // Touching a trusted session must not push the absolute deadline out.
    await touchSession({ now: T0 + 6 * day, idleMs: 15 * MIN });
    expect((await loadSession({ now: T0 + 6 * day, idleMs: 15 * MIN }))?.expiresAt).toBe(
      T0 + 7 * day,
    );
    expect(await loadSession({ now: T0 + 7 * day, idleMs: 15 * MIN })).toBeNull();
  });

  it("clearSession removes the key", async () => {
    await saveSession(await pair(), { trusted: false, now: T0 });
    await clearSession();
    expect(await loadSession({ now: T0, idleMs: 15 * MIN })).toBeNull();
  });

  it("saving replaces any earlier session", async () => {
    const a = await pair();
    const b = await pair();
    await saveSession(a, { trusted: false, now: T0 });
    await saveSession(b, { trusted: true, now: T0 });
    const got = await loadSession({ now: T0, idleMs: 15 * MIN });
    expect(got?.keyPair.publicKey).toBe(b.publicKey);
    expect(got?.trusted).toBe(true);
  });
});

describe("cross-tab events", () => {
  it("delivers lock events to another listener", async () => {
    const seen: string[] = [];
    const off = onVaultEvent((e) => seen.push(e));
    // A second channel object stands in for another tab.
    const other = new BroadcastChannel("apocrypha-vault");
    other.postMessage({ type: "lock" });
    await new Promise((r) => setTimeout(r, 50));
    other.close();
    off();
    expect(seen).toEqual(["lock"]);
  });

  it("announce reaches other channels", async () => {
    const other = new BroadcastChannel("apocrypha-vault");
    const got = new Promise<unknown>((r) => (other.onmessage = (m) => r(m.data)));
    announce("unlock");
    expect(await got).toEqual({ type: "unlock" });
    other.close();
  });
});
