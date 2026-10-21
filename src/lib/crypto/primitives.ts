/**
 * Thin wrappers over WebCrypto (browser and Node `webcrypto`). Nothing here
 * invents a construction: HKDF-SHA-256 and AES-256-GCM with a 96-bit IV and a
 * 128-bit tag.
 */
import { type Bytes, toBytes } from "./encoding";
import { authFailed } from "./errors";

export const KEY_BYTES = 32;
export const IV_BYTES = 12;

const subtle = () => globalThis.crypto.subtle;

/** HKDF-SHA-256 (RFC 5869). Returns `length` bytes. */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Bytes> {
  const base = await subtle().importKey("raw", toBytes(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toBytes(salt), info: toBytes(info) },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function aesKey(key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return subtle().importKey("raw", toBytes(key), "AES-GCM", false, [usage]);
}

/** AES-256-GCM seal. Output is ciphertext || 16-byte tag. */
export async function aesGcmSeal(
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Promise<Bytes> {
  const k = await aesKey(key, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: toBytes(iv), additionalData: toBytes(aad), tagLength: 128 },
    k,
    toBytes(plaintext),
  );
  return new Uint8Array(ct);
}

/** AES-256-GCM open. Any failure is reported as a generic CryptoError. */
export async function aesGcmOpen(
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Bytes> {
  try {
    const k = await aesKey(key, "decrypt");
    const pt = await subtle().decrypt(
      { name: "AES-GCM", iv: toBytes(iv), additionalData: toBytes(aad), tagLength: 128 },
      k,
      toBytes(ciphertext),
    );
    return new Uint8Array(pt);
  } catch {
    throw authFailed();
  }
}
