import { beforeAll, describe, expect, it } from "vitest";
import {
  createVault,
  generateEnvironmentKey,
  unlockVault,
  unwrapEnvironmentKey,
  wrapEnvironmentKey,
  type KeyPair,
} from "../crypto";
import { parseVaultPayload } from "../vault/payload";

// The first-environment grant, built the way create-vault-form does it:
// fresh env key, browser-made env id, key version 1, wrapped to the user's own
// public key. Only the wrapped blob is sent; the env key never leaves the browser.
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

let alice: Awaited<ReturnType<typeof createVault>>;
let bob: Awaited<ReturnType<typeof createVault>>;
let envKey: Uint8Array;
let envId: string;
let wrappedKey: string;

beforeAll(async () => {
  alice = await createVault("correct horse battery staple");
  bob = await createVault("another long passphrase here");
  envKey = generateEnvironmentKey();
  envId = crypto.randomUUID();
  wrappedKey = await wrapEnvironmentKey(envKey, alice.keyPair.publicKey, { envId, keyVersion: 1 });
});

describe("first environment grant", () => {
  it("is a 32-byte key that the owner's key pair unwraps to the same bytes", async () => {
    expect(envKey).toHaveLength(32);
    const out = await unwrapEnvironmentKey(wrappedKey, alice.keyPair, { envId, keyVersion: 1 });
    expect(out).toHaveLength(32);
    expect(hex(out)).toBe(hex(envKey));
  });

  it("unwraps after the vault is unlocked again from its passphrase blob", async () => {
    const unlocked: KeyPair = await unlockVault(alice.passphraseBlob, "correct horse battery staple");
    const out = await unwrapEnvironmentKey(wrappedKey, unlocked, { envId, keyVersion: 1 });
    expect(hex(out)).toBe(hex(envKey));
  });

  it("does not unwrap with another user's key pair", async () => {
    await expect(
      unwrapEnvironmentKey(wrappedKey, bob.keyPair, { envId, keyVersion: 1 }),
    ).rejects.toThrow();
  });

  it("does not unwrap for a different env id or key version", async () => {
    await expect(
      unwrapEnvironmentKey(wrappedKey, alice.keyPair, { envId: crypto.randomUUID(), keyVersion: 1 }),
    ).rejects.toThrow();
    await expect(
      unwrapEnvironmentKey(wrappedKey, alice.keyPair, { envId, keyVersion: 2 }),
    ).rejects.toThrow();
  });

  it("does not contain the environment key, and differs from the vault blobs", () => {
    const keyB64u = Buffer.from(envKey).toString("base64url");
    for (const blob of [wrappedKey]) {
      expect(blob).not.toContain(keyB64u);
      expect(blob).not.toContain(hex(envKey));
    }
    expect(wrappedKey).not.toBe(alice.passphraseBlob);
    expect(wrappedKey).not.toBe(alice.recoveryBlob);
  });

  it("passes server validation as part of the create-vault request", () => {
    const r = parseVaultPayload({
      publicKey: alice.keyPair.publicKey,
      passphraseBlob: alice.passphraseBlob,
      recoveryBlob: alice.recoveryBlob,
      workspace: {
        envId,
        wrappedKey,
        orgName: "Personal",
        projectName: "First project",
        environmentName: "dev",
      },
    });
    expect(r.ok).toBe(true);
  });
});
