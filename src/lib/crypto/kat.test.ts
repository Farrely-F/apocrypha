/**
 * Known-answer tests.
 *
 * Layer 1 checks the primitives against published vectors (RFC 7748, RFC 5869,
 * the GCM spec, the Argon2 reference README).
 * Layer 2 checks the Apocrypha constructions against (a) an independent
 * reference implementation written here on top of node:crypto, and (b) pinned
 * hex vectors that are also printed in docs/crypto.md. If a pinned vector
 * changes, the wire format changed: bump the blob version instead.
 */
import * as nodeCrypto from "node:crypto";
import { argon2i } from "hash-wasm";
import { describe, expect, it } from "vitest";
import { b64u, fromHex, lp, toHex, utf8 } from "./encoding";
import {
  exportPrivateKey,
  generateKeyPair,
  importKeyPair,
  unwrapKey,
  wrapKeyWithEphemeral,
} from "./keys";
import { deriveSecretSubkey, encryptFieldWithIv, decryptField } from "./secrets";
import { deriveVaultKek, sealWithPassphrase, openWithPassphrase } from "./vault";
import { hkdfSha256 } from "./primitives";

const subtle = globalThis.crypto.subtle;
const hex = fromHex;

// X25519 PKCS#8 prefix (RFC 8410) + 32-byte seed.
const X25519_PKCS8 = "302e020100300506032b656e04220420";

// RFC 7748 section 6.1
const ALICE_SK = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a";
const ALICE_PK = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a";
const BOB_SK = "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb";
const BOB_PK = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f";
const SHARED = "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742";

describe("primitive known answers", () => {
  it("X25519 ECDH matches RFC 7748 section 6.1", async () => {
    const priv = await subtle.importKey(
      "pkcs8",
      hex(X25519_PKCS8 + ALICE_SK),
      { name: "X25519" },
      false,
      ["deriveBits"],
    );
    const pub = await subtle.importKey("raw", hex(BOB_PK), { name: "X25519" }, false, []);
    const z = await subtle.deriveBits({ name: "X25519", public: pub }, priv, 256);
    expect(toHex(new Uint8Array(z))).toBe(SHARED);
  });

  it("HKDF-SHA-256 matches RFC 5869 test case 1", async () => {
    const out = await hkdfSha256(
      hex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b"),
      hex("000102030405060708090a0b0c"),
      hex("f0f1f2f3f4f5f6f7f8f9"),
      42,
    );
    expect(toHex(out)).toBe(
      "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    );
  });

  it("AES-256-GCM matches the GCM spec test case 16 (with AAD)", async () => {
    const key = await subtle.importKey(
      "raw",
      hex("feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308"),
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const pt = hex(
      "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39",
    );
    const ct = await subtle.encrypt(
      {
        name: "AES-GCM",
        iv: hex("cafebabefacedbaddecaf888"),
        additionalData: hex("feedfacedeadbeeffeedfacedeadbeefabaddad2"),
      },
      key,
      pt,
    );
    expect(toHex(new Uint8Array(ct))).toBe(
      "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662" +
        "76fc6ece0f4e1768cddf8853bb2d551b",
    );
  });

  it("Argon2 engine matches the reference README vector (argon2i, t=2, m=64MiB, p=4)", async () => {
    // hash-wasm exposes no associated-data input, so the RFC 9106 argon2id
    // vector cannot be reproduced. argon2i shares the core with argon2id.
    const out = await argon2i({
      password: "password",
      salt: "somesalt",
      iterations: 2,
      memorySize: 65536,
      parallelism: 4,
      hashLength: 24,
      outputType: "hex",
    });
    expect(out).toBe("45d7ac72e76f242b20b77b9bf9bf9d5915894e669a24e6c6");
  });
});

// ---------------------------------------------------------------------------
// Independent reference implementation (node:crypto only, no module code).
// ---------------------------------------------------------------------------

function refHkdf(ikm: Uint8Array, info: Uint8Array, len: number): Buffer {
  return Buffer.from(nodeCrypto.hkdfSync("sha256", ikm, Buffer.alloc(0), info, len));
}

function refGcm(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, pt: Uint8Array): Buffer {
  const c = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  return Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
}

function refX25519(skHex: string, pkHex: string): Buffer {
  const privateKey = nodeCrypto.createPrivateKey({
    key: Buffer.from(X25519_PKCS8 + skHex, "hex"),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = nodeCrypto.createPublicKey({
    key: Buffer.from("302a300506032b656e032100" + pkHex, "hex"),
    format: "der",
    type: "spki",
  });
  return nodeCrypto.diffieHellman({ privateKey, publicKey });
}

// ---------------------------------------------------------------------------
// Pinned Apocrypha vectors. Inputs are fixed; outputs are pinned hex/strings.
// ---------------------------------------------------------------------------

const ENV_KEY = fromHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const CTX = { envId: "env_01", secretId: "sec_01", version: 3, keyVersion: 2 };
const IV12 = fromHex("a0a1a2a3a4a5a6a7a8a9aaab");

describe("Apocrypha protocol vectors (v1)", () => {
  it("per-version subkey (HKDF)", async () => {
    const sub = await deriveSecretSubkey(ENV_KEY, CTX);
    const ref = refHkdf(
      ENV_KEY,
      lp("apocrypha/v1/secret-subkey", "env_01", "sec_01", 3, 2),
      32,
    );
    expect(toHex(sub)).toBe(ref.toString("hex"));
    expect(toHex(sub)).toBe(VECTORS.subkey);
  });

  it("secret field encryption (AES-256-GCM, AAD bound)", async () => {
    const blob = await encryptFieldWithIv(ENV_KEY, CTX, "value", "postgres://u:p@h/db", IV12);
    const sub = refHkdf(
      ENV_KEY,
      lp("apocrypha/v1/secret-subkey", "env_01", "sec_01", 3, 2),
      32,
    );
    const aad = lp("apocrypha/v1/secret-aad", "value", "env_01", "sec_01", 3, 2);
    const ct = refGcm(sub, IV12, aad, utf8("postgres://u:p@h/db"));
    expect(blob).toBe(`v1|a256gcm|${b64u(IV12)}|${b64u(ct)}`);
    expect(blob).toBe(VECTORS.secretValue);
    expect(await decryptField(ENV_KEY, CTX, "value", VECTORS.secretValue)).toBe(
      "postgres://u:p@h/db",
    );
  });

  it("environment-key wrap (X25519 ECDH, HKDF, AES-256-GCM)", async () => {
    const eph = await importKeyPair(fromHex(X25519_PKCS8 + ALICE_SK), "x25519");
    const recipient = await importKeyPair(fromHex(X25519_PKCS8 + BOB_SK), "x25519");
    expect(eph.publicKey).toBe(`v1|x25519|${b64u(fromHex(ALICE_PK))}`);
    const blob = await wrapKeyWithEphemeral(ENV_KEY, recipient.publicKey, ["env-key", "env_01", 2], eph);

    const z = refX25519(ALICE_SK, BOB_PK);
    expect(z.toString("hex")).toBe(SHARED);
    const info = lp(
      "apocrypha/v1/wrap",
      "x25519",
      fromHex(ALICE_PK),
      fromHex(BOB_PK),
      "env-key",
      "env_01",
      2,
    );
    const okm = refHkdf(z, info, 44);
    const ct = refGcm(okm.subarray(0, 32), okm.subarray(32), info, ENV_KEY);
    expect(blob).toBe(`v1|x25519-hkdf-a256gcm|${b64u(fromHex(ALICE_PK))}|${b64u(ct)}`);
    expect(blob).toBe(VECTORS.wrap);
    expect(toHex(await unwrapKey(VECTORS.wrap, recipient, ["env-key", "env_01", 2]))).toBe(
      toHex(ENV_KEY),
    );
  });

  it("environment-key wrap, P-256 fallback, matches the node:crypto reference", async () => {
    const eph = await generateKeyPair({ alg: "p256", extractable: true });
    const recipient = await generateKeyPair({ alg: "p256" });
    const blob = await wrapKeyWithEphemeral(ENV_KEY, recipient.publicKey, ["env-key", "env_01", 2], eph);

    // Reference ECDH via node:crypto. The recipient's private key is not
    // extractable, so compute the shared secret from the ephemeral side.
    const ephPriv = nodeCrypto.createPrivateKey({
      key: Buffer.from(await exportPrivateKey(eph.privateKey)),
      format: "der",
      type: "pkcs8",
    });
    const recipientRaw = Buffer.from(recipient.publicKey.split("|")[2], "base64url");
    const recipientPub = nodeCrypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
        recipientRaw,
      ]),
      format: "der",
      type: "spki",
    });
    const z = nodeCrypto.diffieHellman({ privateKey: ephPriv, publicKey: recipientPub });
    const ephRaw = Buffer.from(eph.publicKey.split("|")[2], "base64url");
    const info = lp("apocrypha/v1/wrap", "p256", ephRaw, recipientRaw, "env-key", "env_01", 2);
    const okm = refHkdf(z, info, 44);
    const ct = refGcm(okm.subarray(0, 32), okm.subarray(32), info, ENV_KEY);
    expect(blob).toBe(`v1|p256-hkdf-a256gcm|${b64u(ephRaw)}|${b64u(ct)}`);
    expect(toHex(await unwrapKey(blob, recipient, ["env-key", "env_01", 2]))).toBe(toHex(ENV_KEY));
  });

  it("vault passphrase blob (Argon2id, HKDF, AES-256-GCM)", async () => {
    const pkcs8 = fromHex(X25519_PKCS8 + ALICE_SK);
    const params = { memoryKiB: 64, iterations: 2, parallelism: 1 };
    const salt = fromHex("101112131415161718191a1b1c1d1e1f");
    const blob = await sealWithPassphrase(pkcs8, "x25519", "correct horse", params, salt, IV12);

    // Reference: same Argon2id engine (hash-wasm), everything else independent.
    const { argon2id } = await import("hash-wasm");
    const raw = await argon2id({
      password: utf8("correct horse"),
      salt,
      iterations: 2,
      memorySize: 64,
      parallelism: 1,
      hashLength: 32,
      outputType: "binary",
    });
    const kek = refHkdf(raw, lp("apocrypha/v1/vault-kek"), 32);
    expect(toHex(await deriveVaultKek("correct horse", params, salt))).toBe(kek.toString("hex"));
    const header = `v1|argon2id-a256gcm|x25519|m=64,t=2,p=1|${b64u(salt)}`;
    const ct = refGcm(kek, IV12, utf8(header), pkcs8);
    expect(blob).toBe(`${header}|${b64u(IV12)}|${b64u(ct)}`);
    expect(blob).toBe(VECTORS.vault);
    const opened = await openWithPassphrase(VECTORS.vault, "correct horse");
    expect(toHex(opened.pkcs8)).toBe(toHex(pkcs8));
    expect(opened.params).toEqual(params);
  });
});

// Pinned outputs. Each is also asserted equal to the node:crypto reference above.
const VECTORS = {
  subkey: "64f19a18b39080a11c819fec8d261567f2b57d3db7ab25a48b5447504fc78898",
  secretValue:
    "v1|a256gcm|oKGio6Slpqeoqaqr|jjtAdmGFBXU5GfE5LZZF3OsRt164Qj08YE6EuVHGFkNkr3s",
  wrap:
    "v1|x25519-hkdf-a256gcm|hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo|O4FPWDoRLLx47osy-74_w4Hc6Hv3A08vSwt52J10DauecmbyP5wUsJ4A6gxPRVHL",
  vault:
    "v1|argon2id-a256gcm|x25519|m=64,t=2,p=1|EBESExQVFhcYGRobHB0eHw|oKGio6Slpqeoqaqr|MQFNd3_2i9Vw-mre3sgk6QCh_mrBljTZUo71sOtEWCvLI07vGDKKu1TdBeEy-f3SPN9oxQ9KoraaBywQfuLx8g",
};
