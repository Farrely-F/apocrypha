/**
 * Key pairs and key wrapping (HPKE-shaped: ephemeral ECDH -> HKDF -> AES-GCM).
 *
 * Public keys are strings: `v1|<alg>|<base64url raw key>`.
 * Wrapped keys are strings: `v1|<alg>-hkdf-a256gcm|<ephemeral public>|<ciphertext>`.
 * See docs/crypto.md.
 */
import { b64u, type Bytes, fromB64u, lp, toBytes } from "./encoding";
import { authFailed, CryptoError, invalid, malformed } from "./errors";
import { aesGcmOpen, aesGcmSeal, hkdfSha256, KEY_BYTES } from "./primitives";

export type KeyAlg = "x25519" | "p256";

export interface KeyPair {
  alg: KeyAlg;
  /** `v1|<alg>|<base64url raw public key>`; safe to store on the server. */
  publicKey: string;
  /** Non-extractable unless the pair was created/imported with `extractable: true`. */
  privateKey: CryptoKey;
}

const WRAP_LABEL = "apocrypha/v1/wrap";
const subtle = () => globalThis.crypto.subtle;

const RAW_LENGTH: Record<KeyAlg, number> = { x25519: 32, p256: 65 };

function params(alg: KeyAlg): AlgorithmIdentifier | EcKeyImportParams {
  return alg === "x25519" ? { name: "X25519" } : { name: "ECDH", namedCurve: "P-256" };
}

const isAlg = (s: string): s is KeyAlg => s === "x25519" || s === "p256";

let x25519Support: Promise<boolean> | undefined;

/** True if this runtime's WebCrypto supports X25519 (otherwise P-256 is used). */
export function supportsX25519(): Promise<boolean> {
  x25519Support ??= subtle()
    .generateKey({ name: "X25519" }, false, ["deriveBits"])
    .then(
      () => true,
      () => false,
    );
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
  const alg = opts.alg ?? ((await supportsX25519()) ? "x25519" : "p256");
  if (alg === "x25519" && !(await supportsX25519())) {
    throw new CryptoError("unsupported", "X25519 is not supported by this runtime");
  }
  const pair = (await subtle().generateKey(params(alg), opts.extractable ?? false, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  return { alg, publicKey: formatPublicKey(alg, raw), privateKey: pair.privateKey };
}

/** PKCS#8 bytes of an extractable private key. Treat the result as a secret. */
export async function exportPrivateKey(key: CryptoKey): Promise<Bytes> {
  try {
    return new Uint8Array(await subtle().exportKey("pkcs8", key));
  } catch {
    throw invalid("private key is not extractable");
  }
}

/** Import a PKCS#8 private key; the public key is derived from it. */
export async function importKeyPair(
  pkcs8: Uint8Array,
  alg: KeyAlg,
  opts: { extractable?: boolean } = {},
): Promise<KeyPair> {
  const p = params(alg);
  // A key made in a browser with X25519 cannot be opened in one without it. Say so,
  // instead of reporting a good passphrase as a damaged key.
  if (alg === "x25519" && !(await supportsX25519())) {
    throw new CryptoError("unsupported", "X25519 is not supported by this runtime");
  }
  let probe: CryptoKey;
  let jwk: JsonWebKey;
  try {
    probe = await subtle().importKey("pkcs8", toBytes(pkcs8), p, true, ["deriveBits"]);
    jwk = await subtle().exportKey("jwk", probe);
  } catch {
    throw malformed("private key");
  }
  let raw: Bytes;
  if (alg === "x25519") {
    if (!jwk.x) throw malformed("private key");
    raw = fromB64u(jwk.x);
  } else {
    if (!jwk.x || !jwk.y) throw malformed("private key");
    raw = new Uint8Array([4, ...fromB64u(jwk.x), ...fromB64u(jwk.y)]);
  }
  const privateKey = opts.extractable
    ? probe
    : await subtle().importKey("pkcs8", toBytes(pkcs8), p, false, ["deriveBits"]);
  return { alg, publicKey: formatPublicKey(alg, raw), privateKey };
}

async function ecdh(privateKey: CryptoKey, alg: KeyAlg, peerRaw: Uint8Array): Promise<Bytes> {
  let z: Bytes;
  try {
    const peer = await subtle().importKey("raw", toBytes(peerRaw), params(alg), false, []);
    z = new Uint8Array(
      await subtle().deriveBits({ name: alg === "x25519" ? "X25519" : "ECDH", public: peer }, privateKey, 256),
    );
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
