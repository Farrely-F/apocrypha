import { describe, expect, it } from "vitest";
import {
  CryptoError,
  MAX_SECRET_VALUE_BYTES,
  decryptSecretVersion,
  encryptSecretVersion,
  generateEnvironmentKey,
  type SecretContext,
} from "./index";
import { deriveSecretSubkey } from "./secrets";
import { toHex } from "./encoding";

const key = generateEnvironmentKey();
const ctx: SecretContext = { envId: "env_1", secretId: "sec_1", version: 1, keyVersion: 1 };
const plain = { name: "DATABASE_URL", value: "postgres://u:p@h/db\nline2 ✓", metadata: "prod db" };

const fails = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(CryptoError);

describe("secret version encryption", () => {
  it("round-trips name, value and metadata", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    expect(await decryptSecretVersion(key, ctx, enc)).toEqual(plain);
    for (const f of [enc.name, enc.value, enc.metadata!]) {
      expect(f.startsWith("v1|a256gcm|")).toBe(true);
      expect(f).not.toContain("postgres");
    }
  });

  it("supports absent metadata, empty values and tombstone-free empties", async () => {
    const enc = await encryptSecretVersion(key, ctx, { name: "A", value: "" });
    expect(enc.metadata).toBeNull();
    expect(await decryptSecretVersion(key, ctx, enc)).toEqual({
      name: "A",
      value: "",
      metadata: null,
    });
  });

  it("uses fresh IVs: same input encrypts differently", async () => {
    const a = await encryptSecretVersion(key, ctx, plain);
    const b = await encryptSecretVersion(key, ctx, plain);
    expect(a.value).not.toBe(b.value);
  });

  it("enforces the 64 KB value cap", async () => {
    const ok = "x".repeat(MAX_SECRET_VALUE_BYTES);
    const enc = await encryptSecretVersion(key, ctx, { name: "BIG", value: ok });
    expect((await decryptSecretVersion(key, ctx, enc)).value).toBe(ok);
    await fails(encryptSecretVersion(key, ctx, { name: "BIG", value: ok + "x" }));
    // The cap is in bytes, not code units.
    await fails(
      encryptSecretVersion(key, ctx, { name: "BIG", value: "é".repeat(MAX_SECRET_VALUE_BYTES / 2 + 1) }),
    );
  });

  it("derives distinct subkeys per version, key version, secret and env", async () => {
    const seen = new Set<string>();
    for (const c of [
      ctx,
      { ...ctx, version: 2 },
      { ...ctx, keyVersion: 2 },
      { ...ctx, secretId: "sec_2" },
      { ...ctx, envId: "env_2" },
    ]) {
      seen.add(toHex(await deriveSecretSubkey(key, c)));
    }
    expect(seen.size).toBe(5);
  });

  it("does not let adjacent id fields bleed into each other", async () => {
    const a = await deriveSecretSubkey(key, { ...ctx, envId: "ab", secretId: "c" });
    const b = await deriveSecretSubkey(key, { ...ctx, envId: "a", secretId: "bc" });
    expect(toHex(a)).not.toBe(toHex(b));
  });
});

describe("secret version failures", () => {
  it("fails on tampered ciphertext in any field", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    const flip = (s: string) => {
      const p = s.split("|");
      p[3] = p[3].slice(0, 2) + (p[3][2] === "A" ? "B" : "A") + p[3].slice(3);
      return p.join("|");
    };
    await fails(decryptSecretVersion(key, ctx, { ...enc, name: flip(enc.name) }));
    await fails(decryptSecretVersion(key, ctx, { ...enc, value: flip(enc.value) }));
    await fails(decryptSecretVersion(key, ctx, { ...enc, metadata: flip(enc.metadata!) }));
  });

  it("fails on a tampered IV", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    const p = enc.value.split("|");
    p[2] = p[2].slice(0, 1) + (p[2][1] === "A" ? "B" : "A") + p[2].slice(2);
    await fails(decryptSecretVersion(key, ctx, { ...enc, value: p.join("|") }));
  });

  it("fails when the secret id is swapped", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    await fails(decryptSecretVersion(key, { ...ctx, secretId: "sec_2" }, enc));
  });

  it("fails when the environment id is swapped", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    await fails(decryptSecretVersion(key, { ...ctx, envId: "env_2" }, enc));
  });

  it("fails on a replayed version (old ciphertext presented as a new version)", async () => {
    const v1 = await encryptSecretVersion(key, ctx, plain);
    await fails(decryptSecretVersion(key, { ...ctx, version: 2 }, v1));
  });

  it("fails on the wrong key version", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    await fails(decryptSecretVersion(key, { ...ctx, keyVersion: 2 }, enc));
  });

  it("fails with the wrong environment key", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    await fails(decryptSecretVersion(generateEnvironmentKey(), ctx, enc));
  });

  it("fails when name and value ciphertexts are swapped", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    await fails(decryptSecretVersion(key, ctx, { ...enc, name: enc.value, value: enc.name }));
  });

  it("rejects unknown blob versions, algorithms and malformed blobs", async () => {
    const enc = await encryptSecretVersion(key, ctx, plain);
    for (const bad of [
      enc.value.replace(/^v1/, "v2"),
      enc.value.replace("a256gcm", "a128gcm"),
      enc.value + "|x",
      "v1|a256gcm|",
      "nope",
      "",
    ]) {
      await fails(decryptSecretVersion(key, ctx, { ...enc, value: bad }));
    }
  });

  it("rejects invalid contexts and key sizes", async () => {
    await fails(encryptSecretVersion(key, { ...ctx, version: -1 }, plain));
    await fails(encryptSecretVersion(key, { ...ctx, version: 1.5 }, plain));
    await fails(encryptSecretVersion(key, { ...ctx, keyVersion: 2 ** 32 }, plain));
    await fails(encryptSecretVersion(new Uint8Array(31), ctx, plain));
  });
});
