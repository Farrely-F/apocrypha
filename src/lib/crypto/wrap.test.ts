import { describe, expect, it } from "vitest";
import {
  CryptoError,
  generateEnvironmentKey,
  generateKeyPair,
  supportsX25519,
  unwrapEnvironmentKey,
  wrapEnvironmentKey,
  type KeyAlg,
} from "./index";
import { toHex } from "./encoding";

const ALGS: KeyAlg[] = ["x25519", "p256"];

function tamper(blob: string, index: number): string {
  const parts = blob.split("|");
  const s = parts[index];
  const c = s[2] === "A" ? "B" : "A";
  parts[index] = s.slice(0, 2) + c + s.slice(3);
  return parts.join("|");
}

it("reports X25519 support on this runtime", async () => {
  expect(await supportsX25519()).toBe(true);
});

describe.each(ALGS)("environment key wrapping (%s)", (alg) => {
  const ctx = { envId: "env_1", keyVersion: 1 };

  it("round-trips an environment key between two principals", async () => {
    const alice = await generateKeyPair({ alg });
    const bob = await generateKeyPair({ alg });
    const envKey = generateEnvironmentKey();
    expect(envKey).toHaveLength(32);

    const forAlice = await wrapEnvironmentKey(envKey, alice.publicKey, ctx);
    const forBob = await wrapEnvironmentKey(envKey, bob.publicKey, ctx);
    expect(toHex(await unwrapEnvironmentKey(forAlice, alice, ctx))).toBe(toHex(envKey));
    expect(toHex(await unwrapEnvironmentKey(forBob, bob, ctx))).toBe(toHex(envKey));
  });

  it("is randomised and versioned", async () => {
    const bob = await generateKeyPair({ alg });
    const k = generateEnvironmentKey();
    const a = await wrapEnvironmentKey(k, bob.publicKey, ctx);
    const b = await wrapEnvironmentKey(k, bob.publicKey, ctx);
    expect(a).not.toBe(b);
    expect(a.startsWith(`v1|${alg}-hkdf-a256gcm|`)).toBe(true);
    expect(bob.publicKey.startsWith(`v1|${alg}|`)).toBe(true);
  });

  it("fails for the wrong recipient", async () => {
    const bob = await generateKeyPair({ alg });
    const eve = await generateKeyPair({ alg });
    const blob = await wrapEnvironmentKey(generateEnvironmentKey(), bob.publicKey, ctx);
    await expect(unwrapEnvironmentKey(blob, eve, ctx)).rejects.toBeInstanceOf(CryptoError);
  });

  it("fails when the env id or key version differs (swap/replay)", async () => {
    const bob = await generateKeyPair({ alg });
    const blob = await wrapEnvironmentKey(generateEnvironmentKey(), bob.publicKey, ctx);
    await expect(
      unwrapEnvironmentKey(blob, bob, { envId: "env_2", keyVersion: 1 }),
    ).rejects.toBeInstanceOf(CryptoError);
    await expect(
      unwrapEnvironmentKey(blob, bob, { envId: "env_1", keyVersion: 2 }),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("fails on a tampered ephemeral key or ciphertext", async () => {
    const bob = await generateKeyPair({ alg });
    const blob = await wrapEnvironmentKey(generateEnvironmentKey(), bob.publicKey, ctx);
    await expect(unwrapEnvironmentKey(tamper(blob, 2), bob, ctx)).rejects.toBeInstanceOf(
      CryptoError,
    );
    await expect(unwrapEnvironmentKey(tamper(blob, 3), bob, ctx)).rejects.toBeInstanceOf(
      CryptoError,
    );
  });

  it("rejects malformed, unknown-version and wrong-algorithm blobs", async () => {
    const bob = await generateKeyPair({ alg });
    const blob = await wrapEnvironmentKey(generateEnvironmentKey(), bob.publicKey, ctx);
    for (const bad of [
      "",
      "garbage",
      blob.replace(/^v1/, "v2"),
      blob.replace(/^v1\|[a-z0-9]+-/, "v1|rsa-"),
      blob + "|extra",
      blob.split("|").slice(0, 3).join("|"),
    ]) {
      await expect(unwrapEnvironmentKey(bad, bob, ctx)).rejects.toBeInstanceOf(CryptoError);
    }
  });

  it("refuses to wrap to a malformed public key", async () => {
    const k = generateEnvironmentKey();
    for (const bad of ["", "x", `v1|${alg}|AAAA`, `v2|${alg}|AAAA`, "v1|rsa|AAAA"]) {
      await expect(wrapEnvironmentKey(k, bad, ctx)).rejects.toBeInstanceOf(CryptoError);
    }
    await expect(
      wrapEnvironmentKey(new Uint8Array(16), (await generateKeyPair({ alg })).publicKey, ctx),
    ).rejects.toBeInstanceOf(CryptoError);
  });
});

it("rejects a blob wrapped for another algorithm", async () => {
  const x = await generateKeyPair({ alg: "x25519" });
  const p = await generateKeyPair({ alg: "p256" });
  const ctx = { envId: "e", keyVersion: 1 };
  const blob = await wrapEnvironmentKey(generateEnvironmentKey(), x.publicKey, ctx);
  await expect(unwrapEnvironmentKey(blob, p, ctx)).rejects.toBeInstanceOf(CryptoError);
});

it("rejects a low-order X25519 ephemeral key (all-zero shared secret)", async () => {
  const bob = await generateKeyPair({ alg: "x25519" });
  const ctx = { envId: "e", keyVersion: 1 };
  const blob = await wrapEnvironmentKey(generateEnvironmentKey(), bob.publicKey, ctx);
  const parts = blob.split("|");
  parts[2] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 32 zero bytes
  await expect(unwrapEnvironmentKey(parts.join("|"), bob, ctx)).rejects.toBeInstanceOf(
    CryptoError,
  );
});
