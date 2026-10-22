/**
 * Key pairs and key wrapping (HPKE-shaped: ephemeral ECDH -> HKDF -> AES-GCM).
 *
 * Public keys are strings: `v1|<alg>|<base64url raw key>`.
 * Wrapped keys are strings: `v1|<alg>-hkdf-a256gcm|<ephemeral public>|<ciphertext>`.
 * See docs/crypto.md.
 */
import { x25519 as soft25519 } from "@noble/curves/ed25519.js";
import { b64u, type Bytes, fromB64u, lp, toBytes } from "./encoding";
import { authFailed, invalid, malformed } from "./errors";
import { aesGcmOpen, aesGcmSeal, hkdfSha256, KEY_BYTES } from "./primitives";

export type KeyAlg = "x25519" | "p256";

/**
 * An X25519 scalar held in script memory, for browsers whose WebCrypto cannot import
 * or use X25519 keys (some iOS WebKit builds). The math is `@noble/curves`. Unlike a
 * non-extractable CryptoKey it is readable by script, so the keystore never persists it.
 */
export interface SoftKey {
  readonly soft: Uint8Array;
}

export const isSoftKey = (k: CryptoKey | SoftKey): k is SoftKey => "soft" in k;

export interface KeyPair {
  alg: KeyAlg;
  /** `v1|<alg>|<base64url raw public key>`; safe to store on the server. */
  publicKey: string;
  /** Non-extractable unless the pair was created/imported with `extractable: true`. */
  privateKey: CryptoKey | SoftKey;
}

const WRAP_LABEL = "apocrypha/v1/wrap";
const subtle = () => globalThis.crypto.subtle;

const RAW_LENGTH: Record<KeyAlg, number> = { x25519: 32, p256: 65 };

function params(alg: KeyAlg): AlgorithmIdentifier | EcKeyImportParams {
  return alg === "x25519" ? { name: "X25519" } : { name: "ECDH", namedCurve: "P-256" };
}

const isAlg = (s: string): s is KeyAlg => s === "x25519" || s === "p256";

let x25519Support: Promise<boolean> | undefined;

/**
 * True if this runtime's WebCrypto can do everything the app needs from X25519: make,
 * export and import keys and derive. Some iOS WebKit builds make keys but refuse to
 * import them, so a bare `generateKey` is not enough. When false, X25519 runs in script
 * (see {@link SoftKey}) and new vaults default to P-256.
 */
export function supportsX25519(): Promise<boolean> {
  x25519Support ??= (async () => {
    const x = { name: "X25519" };
    const pair = (await subtle().generateKey(x, true, ["deriveBits"])) as CryptoKeyPair;
    const priv = await subtle().importKey(
      "pkcs8",
      await subtle().exportKey("pkcs8", pair.privateKey),
      x,
      false,
      ["deriveBits"],
    );
    const pub = await subtle().importKey("raw", await subtle().exportKey("raw", pair.publicKey), x, false, []);
    await subtle().deriveBits({ name: "X25519", public: pub }, priv, 256);
    return true;
  })().catch(() => false);
  return x25519Support;
}

export function parsePublicKey(s: string): { alg: KeyAlg; raw: Bytes } {
  const parts = typeof s === "string" ? s.split("|") : [];
  if (parts.length !== 3 || parts[0] !== "v1" || !isAlg(parts[1])) throw malformed("public key");
  const alg = parts[1];
  let raw: Bytes;
  try {
    raw = fromB64u(parts[2]);
  } catch {
    throw malformed("public key");
  }
  if (raw.length !== RAW_LENGTH[alg] || (alg === "p256" && raw[0] !== 4)) {
    throw malformed("public key");
  }
  return { alg, raw };
}

export const formatPublicKey = (alg: KeyAlg, raw: Uint8Array) => `v1|${alg}|${b64u(raw)}`;

export async function generateKeyPair(
  opts: { alg?: KeyAlg; extractable?: boolean } = {},
): Promise<KeyPair> {
  const native = await supportsX25519();
  const alg = opts.alg ?? (native ? "x25519" : "p256");
  if (alg === "x25519" && !native) {
    const { secretKey, publicKey } = soft25519.keygen();
    return { alg, publicKey: formatPublicKey(alg, publicKey), privateKey: { soft: secretKey } };
  }
  const pair = (await subtle().generateKey(params(alg), opts.extractable ?? false, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  return { alg, publicKey: formatPublicKey(alg, raw), privateKey: pair.privateKey };
}

/** PKCS#8 bytes of an extractable (or in-memory) private key. Treat the result as a secret. */
export async function exportPrivateKey(key: CryptoKey | SoftKey): Promise<Bytes> {
  if (isSoftKey(key)) return new Uint8Array([...X25519_PKCS8_PREFIX, ...key.soft]);
  try {
    return new Uint8Array(await subtle().exportKey("pkcs8", key));
  } catch {
    throw invalid("private key is not extractable");
  }
}

/** RFC 8410 PrivateKeyInfo for X25519: this prefix, then the 32-byte scalar. */
const X25519_PKCS8_PREFIX = [
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
];
const X25519_BASE_POINT = Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 9 : 0));

/** The scalar inside an RFC 8410 X25519 PKCS#8 blob, or undefined for any other shape. */
function x25519Scalar(pkcs8: Uint8Array): Uint8Array | undefined {
  const n = X25519_PKCS8_PREFIX.length;
  if (pkcs8.length !== n + 32) return undefined;
  return X25519_PKCS8_PREFIX.every((b, i) => pkcs8[i] === b) ? pkcs8.slice(n) : undefined;
}

/** X25519 public key = private key times the base point; no JWK export needed. */
async function x25519Public(privateKey: CryptoKey): Promise<Bytes> {
  const base = await subtle().importKey("raw", toBytes(X25519_BASE_POINT), params("x25519"), false, []);
  return new Uint8Array(
    await subtle().deriveBits({ name: "X25519", public: base }, privateKey, 256),
  );
}

/** P-256 has no such shortcut: its public point comes from the JWK of an extractable copy. */
async function p256Public(extractableKey: CryptoKey): Promise<Bytes> {
  const jwk = await subtle().exportKey("jwk", extractableKey);
  if (!jwk.x || !jwk.y) throw malformed("private key");
  return new Uint8Array([4, ...fromB64u(jwk.x), ...fromB64u(jwk.y)]);
}

/**
 * Import a PKCS#8 private key; the public key is derived from it.
 *
 * X25519 goes through WebCrypto where it fully works. Where it does not (or the import is
 * refused anyway), the scalar is held in script memory as a {@link SoftKey} instead, so a
 * correct passphrase always opens the vault.
 */
export async function importKeyPair(
  pkcs8: Uint8Array,
  alg: KeyAlg,
  opts: { extractable?: boolean } = {},
): Promise<KeyPair> {
  const p = params(alg);
  const extractable = opts.extractable ?? false;
  const usages: KeyUsage[] = ["deriveBits"];

  if (alg === "p256") {
    let probe: CryptoKey;
    let raw: Bytes;
    try {
      probe = await subtle().importKey("pkcs8", toBytes(pkcs8), p, true, usages);
      raw = await p256Public(probe);
    } catch {
      throw malformed("private key");
    }
    const privateKey = extractable
      ? probe
      : await subtle().importKey("pkcs8", toBytes(pkcs8), p, false, usages);
    return { alg, publicKey: formatPublicKey(alg, raw), privateKey };
  }

  if (await supportsX25519()) {
    try {
      const privateKey = await subtle().importKey("pkcs8", toBytes(pkcs8), p, extractable, usages);
      return { alg, publicKey: formatPublicKey(alg, await x25519Public(privateKey)), privateKey };
    } catch {
      // Fall through to the in-memory key.
    }
  }
  const scalar = x25519Scalar(pkcs8);
  if (!scalar) throw malformed("private key");
  return {
    alg,
    publicKey: formatPublicKey(alg, soft25519.getPublicKey(scalar)),
    privateKey: { soft: scalar },
  };
}

async function ecdh(privateKey: CryptoKey | SoftKey, alg: KeyAlg, peerRaw: Uint8Array): Promise<Bytes> {
  let z: Bytes;
  try {
    if (isSoftKey(privateKey)) {
      z = soft25519.getSharedSecret(privateKey.soft, peerRaw);
    } else {
      const peer = await subtle().importKey("raw", toBytes(peerRaw), params(alg), false, []);
      z = new Uint8Array(
        await subtle().deriveBits({ name: alg === "x25519" ? "X25519" : "ECDH", public: peer }, privateKey, 256),
      );
    }
  } catch {
    throw authFailed();
  }
  // Reject low-order points (RFC 7748 section 6.1 / RFC 9180 section 7.1.4).
  if (z.every((b) => b === 0)) throw authFailed();
  return z;
}

export type WrapContext = readonly (string | number)[];

async function wrapSecrets(z: Uint8Array, info: Uint8Array) {
  const okm = await hkdfSha256(z, new Uint8Array(0), info, KEY_BYTES + 12);
  return { key: okm.slice(0, KEY_BYTES), iv: okm.slice(KEY_BYTES) };
}

/**
 * Deterministic form of {@link wrapKey} taking the sender's ephemeral key pair.
 * Exported for known-answer tests only; never reuse an ephemeral key.
 */
export async function wrapKeyWithEphemeral(
  key: Uint8Array,
  recipientPublicKey: string,
  context: WrapContext,
  ephemeral: KeyPair,
): Promise<string> {
  if (key.length !== KEY_BYTES) throw invalid("key must be 32 bytes");
  const recipient = parsePublicKey(recipientPublicKey);
  if (ephemeral.alg !== recipient.alg) throw invalid("key algorithm mismatch");
  const eph = parsePublicKey(ephemeral.publicKey);
  const z = await ecdh(ephemeral.privateKey, recipient.alg, recipient.raw);
  const info = lp(WRAP_LABEL, recipient.alg, eph.raw, recipient.raw, ...context);
  const { key: k, iv } = await wrapSecrets(z, info);
  const ct = await aesGcmSeal(k, iv, info, key);
  return `v1|${recipient.alg}-hkdf-a256gcm|${b64u(eph.raw)}|${b64u(ct)}`;
}

/** Wrap a 32-byte key to a recipient public key, bound to `context`. */
export async function wrapKey(
  key: Uint8Array,
  recipientPublicKey: string,
  context: WrapContext,
): Promise<string> {
  const recipient = parsePublicKey(recipientPublicKey);
  const ephemeral = await generateKeyPair({ alg: recipient.alg });
  return wrapKeyWithEphemeral(key, recipientPublicKey, context, ephemeral);
}

/** Inverse of {@link wrapKey}. Fails unless the same `context` is supplied. */
export async function unwrapKey(
  blob: string,
  recipient: Pick<KeyPair, "alg" | "publicKey" | "privateKey">,
  context: WrapContext,
): Promise<Bytes> {
  const parts = typeof blob === "string" ? blob.split("|") : [];
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== `${recipient.alg}-hkdf-a256gcm`) {
    throw malformed("wrapped key");
  }
  const own = parsePublicKey(recipient.publicKey);
  let ephRaw: Bytes;
  let ct: Bytes;
  try {
    ephRaw = fromB64u(parts[2]);
    ct = fromB64u(parts[3]);
  } catch {
    throw malformed("wrapped key");
  }
  if (ephRaw.length !== RAW_LENGTH[own.alg] || ct.length !== KEY_BYTES + 16) {
    throw malformed("wrapped key");
  }
  const z = await ecdh(recipient.privateKey, own.alg, ephRaw);
  const info = lp(WRAP_LABEL, own.alg, ephRaw, own.raw, ...context);
  const { key: k, iv } = await wrapSecrets(z, info);
  return aesGcmOpen(k, iv, info, ct);
}
