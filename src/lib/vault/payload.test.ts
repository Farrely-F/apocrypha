import { beforeAll, describe, expect, it } from "vitest";
import { createVault } from "../crypto";
import { MIN_ARGON2, parseVaultPayload } from "./payload";

let good: { publicKey: string; passphraseBlob: string; recoveryBlob: string };
let weak: typeof good;

beforeAll(async () => {
  const v = await createVault("correct horse battery staple");
  good = {
    publicKey: v.keyPair.publicKey,
    passphraseBlob: v.passphraseBlob,
    recoveryBlob: v.recoveryBlob,
  };
  const w = await createVault("correct horse battery staple", {
    params: { memoryKiB: 8192, iterations: 1, parallelism: 1 },
  });
  weak = {
    publicKey: w.keyPair.publicKey,
    passphraseBlob: w.passphraseBlob,
    recoveryBlob: w.recoveryBlob,
  };
});

describe("parseVaultPayload", () => {
  it("accepts what createVault produces", () => {
    const r = parseVaultPayload(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(good);
  });

  it("rejects non-objects and missing fields", () => {
    for (const bad of [null, undefined, "x", 1, [], {}]) {
      expect(parseVaultPayload(bad).ok).toBe(false);
    }
    for (const k of Object.keys(good)) {
      const { [k as keyof typeof good]: _drop, ...rest } = good;
      void _drop;
      expect(parseVaultPayload(rest).ok).toBe(false);
    }
  });

  it("rejects extra fields, so a stray private key is never accepted", () => {
    expect(parseVaultPayload({ ...good, privateKey: "x" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, recoveryKey: "x" }).ok).toBe(false);
  });

  it("rejects wrong types and oversize values", () => {
    expect(parseVaultPayload({ ...good, publicKey: 5 }).ok).toBe(false);
    expect(
      parseVaultPayload({ ...good, passphraseBlob: good.passphraseBlob + "A".repeat(5000) }).ok,
    ).toBe(false);
  });

  it("rejects malformed keys and blobs", () => {
    expect(parseVaultPayload({ ...good, publicKey: "v2|x25519|AAAA" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, publicKey: "v1|rsa|AAAA" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, passphraseBlob: "v1|garbage" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, recoveryBlob: "v1|argon2id-a256gcm|x" }).ok).toBe(false);
  });

  it("rejects blobs wrapped for a different algorithm than the public key", () => {
    const flipped = good.publicKey.includes("|x25519|")
      ? good.publicKey.replace("|x25519|", "|p256|")
      : good.publicKey.replace("|p256|", "|x25519|");
    expect(parseVaultPayload({ ...good, publicKey: flipped }).ok).toBe(false);
  });

  it("enforces a minimum Argon2id cost", () => {
    expect(MIN_ARGON2.memoryKiB).toBeGreaterThanOrEqual(19456);
    const r = parseVaultPayload(weak);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cost|memory|parameters/i);
  });
});
