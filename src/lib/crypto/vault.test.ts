import { describe, expect, it } from "vitest";
import {
  CryptoError,
  DEFAULT_ARGON2_PARAMS,
  changePassphrase,
  createVault,
  generateEnvironmentKey,
  readVaultKdfParams,
  resetPassphraseWithRecoveryKey,
  unlockVault,
  unlockVaultWithRecoveryKey,
  unwrapEnvironmentKey,
  wrapEnvironmentKey,
  type KeyAlg,
} from "./index";
import { toHex } from "./encoding";

const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 };
const fails = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(CryptoError);

function flipPart(blob: string, index: number): string {
  const parts = blob.split("|");
  const s = parts[index];
  parts[index] = s.slice(0, 1) + (s[1] === "A" ? "B" : "A") + s.slice(2);
  return parts.join("|");
}

describe("defaults", () => {
  it("start at 64 MiB, t=3, p=1 and are stored in the blob", async () => {
    expect(DEFAULT_ARGON2_PARAMS).toEqual({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
    const vault = await createVault("correct horse battery staple");
    expect(vault.passphraseBlob.split("|")[3]).toBe("m=65536,t=3,p=1");
    expect(readVaultKdfParams(vault.passphraseBlob)).toEqual(DEFAULT_ARGON2_PARAMS);
    const unlocked = await unlockVault(vault.passphraseBlob, "correct horse battery staple");
    expect(unlocked.publicKey).toBe(vault.keyPair.publicKey);
  });
});

describe.each<KeyAlg>(["x25519", "p256"])("vault (%s)", (alg) => {
  const pass = "correct horse battery staple";

  it("unlocks with the passphrase and with the recovery key to the same identity", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    expect(vault.passphraseBlob.startsWith(`v1|argon2id-a256gcm|${alg}|m=64,t=1,p=1|`)).toBe(true);
    expect(vault.recoveryBlob.startsWith(`v1|recovery-a256gcm|${alg}|`)).toBe(true);

    const a = await unlockVault(vault.passphraseBlob, pass);
    const b = await unlockVaultWithRecoveryKey(vault.recoveryBlob, vault.recoveryKey);
    expect(a.publicKey).toBe(vault.keyPair.publicKey);
    expect(b.publicKey).toBe(vault.keyPair.publicKey);
    expect(a.alg).toBe(alg);
  });

  it("returns non-extractable private keys that still unwrap environment keys", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    const unlocked = await unlockVault(vault.passphraseBlob, pass);
    const keys = [unlocked.privateKey, vault.keyPair.privateKey] as CryptoKey[];
    expect(keys[0].extractable).toBe(false);
    expect(keys[1].extractable).toBe(false);
    await expect(
      globalThis.crypto.subtle.exportKey("pkcs8", keys[0]),
    ).rejects.toBeDefined();

    const envKey = generateEnvironmentKey();
    const ctx = { envId: "env_1", keyVersion: 1 };
    const grant = await wrapEnvironmentKey(envKey, vault.keyPair.publicKey, ctx);
    const out = await unwrapEnvironmentKey(grant, unlocked, ctx);
    expect(toHex(out)).toBe(toHex(envKey));
  });

  it("fails with a wrong passphrase", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    await fails(unlockVault(vault.passphraseBlob, pass + "!"));
    await fails(unlockVault(vault.passphraseBlob, ""));
  });

  it("fails with a wrong recovery key, and recovery key cannot open the passphrase blob", async () => {
    const a = await createVault(pass, { alg, params: FAST });
    const b = await createVault(pass, { alg, params: FAST });
    await fails(unlockVaultWithRecoveryKey(a.recoveryBlob, b.recoveryKey));
    await fails(unlockVaultWithRecoveryKey(a.recoveryBlob, "not a key"));
    await fails(unlockVault(a.recoveryBlob, pass));
    await fails(unlockVaultWithRecoveryKey(a.passphraseBlob, a.recoveryKey));
  });

  it("detects tampering with any blob field, including the stored KDF params", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    const parts = vault.passphraseBlob.split("|");
    for (const i of [4, 5, 6]) await fails(unlockVault(flipPart(vault.passphraseBlob, i), pass));
    // header fields are bound as AAD even where they would not change the key
    const swappedAlg = [...parts];
    swappedAlg[2] = alg === "x25519" ? "p256" : "x25519";
    await fails(unlockVault(swappedAlg.join("|"), pass));
    const raised = [...parts];
    raised[3] = "m=64,t=2,p=1";
    await fails(unlockVault(raised.join("|"), pass));

    const rparts = vault.recoveryBlob.split("|");
    for (const i of [3, 4]) {
      await fails(unlockVaultWithRecoveryKey(flipPart(vault.recoveryBlob, i), vault.recoveryKey));
    }
    expect(rparts).toHaveLength(5);
  });

  it("formats the recovery key for humans and parses it back tolerantly", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    expect(vault.recoveryKey).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
    const sloppy = vault.recoveryKey.toLowerCase().replace(/-/g, " ");
    const u = await unlockVaultWithRecoveryKey(vault.recoveryBlob, sloppy);
    expect(u.publicKey).toBe(vault.keyPair.publicKey);
  });

  it("changes the passphrase and raises Argon2id params while keeping the identity", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    const raised = { memoryKiB: 128, iterations: 2, parallelism: 1 };
    const next = await changePassphrase(vault.passphraseBlob, pass, "new passphrase", raised);
    expect(readVaultKdfParams(next)).toEqual(raised);
    await fails(unlockVault(next, pass));
    expect((await unlockVault(next, "new passphrase")).publicKey).toBe(vault.keyPair.publicKey);
    await fails(changePassphrase(vault.passphraseBlob, "wrong", "x", raised));
    // old blobs keep working with their own stored params
    expect((await unlockVault(vault.passphraseBlob, pass)).publicKey).toBe(
      vault.keyPair.publicKey,
    );
  });

  it("resets the passphrase from the recovery key", async () => {
    const vault = await createVault(pass, { alg, params: FAST });
    const next = await resetPassphraseWithRecoveryKey(
      vault.recoveryBlob,
      vault.recoveryKey,
      "fresh one",
      FAST,
    );
    expect((await unlockVault(next, "fresh one")).publicKey).toBe(vault.keyPair.publicKey);
    await fails(resetPassphraseWithRecoveryKey(vault.recoveryBlob, "bad", "x", FAST));
  });
});

describe("passphrase handling and blob validation", () => {
  it("normalises passphrases to NFKC", async () => {
    const vault = await createVault("café pass", { params: FAST });
    const u = await unlockVault(vault.passphraseBlob, "café pass");
    expect(u.publicKey).toBe(vault.keyPair.publicKey);
  });

  it("rejects empty passphrases on create", async () => {
    await fails(createVault("", { params: FAST }));
  });

  it("rejects out-of-range or malformed KDF params instead of burning CPU/RAM", async () => {
    const vault = await createVault("pw", { params: FAST });
    const parts = vault.passphraseBlob.split("|");
    for (const p of [
      "m=4194304,t=1,p=1",
      "m=64,t=1000,p=1",
      "m=64,t=1,p=0",
      "m=4,t=1,p=1",
      "m=64,t=1",
      "t=1,m=64,p=1",
      "m=-1,t=1,p=1",
      "m=64,t=1,p=1,x=2",
    ]) {
      const bad = [...parts];
      bad[3] = p;
      await fails(unlockVault(bad.join("|"), "pw"));
      expect(() => readVaultKdfParams(bad.join("|"))).toThrow(CryptoError);
    }
    await fails(createVault("pw", { params: { memoryKiB: 4194304, iterations: 1, parallelism: 1 } }));
  });

  it("rejects unknown versions and malformed blobs", async () => {
    const vault = await createVault("pw", { params: FAST });
    for (const bad of ["", "x", vault.passphraseBlob.replace(/^v1/, "v2"), vault.passphraseBlob + "|x"]) {
      await fails(unlockVault(bad, "pw"));
    }
    for (const bad of ["", "x", vault.recoveryBlob.replace(/^v1/, "v2"), vault.recoveryBlob + "|x"]) {
      await fails(unlockVaultWithRecoveryKey(bad, vault.recoveryKey));
    }
  });

  it("uses fresh salts and recovery keys per vault", async () => {
    const a = await createVault("pw", { params: FAST });
    const b = await createVault("pw", { params: FAST });
    expect(a.passphraseBlob.split("|")[4]).not.toBe(b.passphraseBlob.split("|")[4]);
    expect(a.recoveryKey).not.toBe(b.recoveryKey);
  });
});
