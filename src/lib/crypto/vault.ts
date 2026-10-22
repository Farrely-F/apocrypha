/**
 * Vault blobs: the user's private key wrapped under the passphrase (Argon2id)
 * and, separately, under a one-time recovery key.
 *
 *   passphrase blob: v1|argon2id-a256gcm|<keyalg>|m=<KiB>,t=<n>,p=<n>|<salt>|<iv>|<ct>
 *   recovery blob:   v1|recovery-a256gcm|<keyalg>|<iv>|<ct>
 *
 * Plaintext is the PKCS#8 private key. The AAD is the UTF-8 header (every field
 * before the IV), so the algorithm and the stored Argon2id parameters are
 * authenticated.
 */
import { argon2id } from "hash-wasm";
import {
  b64u,
  base32Decode,
  base32Encode,
  type Bytes,
  fromB64u,
  lp,
  randomBytes,
  utf8,
} from "./encoding";
import { authFailed, CryptoError, invalid, malformed } from "./errors";
import { aesGcmOpen, aesGcmSeal, hkdfSha256, IV_BYTES, KEY_BYTES } from "./primitives";
import { exportPrivateKey, generateKeyPair, importKeyPair, type KeyAlg, type KeyPair } from "./keys";

export interface Argon2Params {
  /** Memory in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

/** Starting parameters from DESIGN.md section 12: 64 MiB, t=3, p=1. */
export const DEFAULT_ARGON2_PARAMS: Readonly<Argon2Params> = Object.freeze({
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
});

// Sanity bounds so a hostile blob cannot make the client burn CPU or memory.
// These are not a security floor: callers decide what is "strong enough".
const MAX_MEMORY_KIB = 1_048_576; // 1 GiB
const MAX_ITERATIONS = 64;
const MAX_PARALLELISM = 16;

const SALT_BYTES = 16;
const RECOVERY_KEY_BYTES = 32;
const KEK_LABEL = "apocrypha/v1/vault-kek";
const RECOVERY_LABEL = "apocrypha/v1/recovery-kek";

const isAlg = (s: string): s is KeyAlg => s === "x25519" || s === "p256";

export function checkParams(p: Argon2Params): Argon2Params {
  const int = (n: unknown) => Number.isSafeInteger(n);
  if (
    !int(p.memoryKiB) ||
    !int(p.iterations) ||
    !int(p.parallelism) ||
    p.parallelism < 1 ||
    p.parallelism > MAX_PARALLELISM ||
    p.iterations < 1 ||
    p.iterations > MAX_ITERATIONS ||
    p.memoryKiB < 8 * p.parallelism ||
    p.memoryKiB > MAX_MEMORY_KIB
  ) {
    throw invalid("Argon2id parameters out of range");
  }
  return { memoryKiB: p.memoryKiB, iterations: p.iterations, parallelism: p.parallelism };
}

const formatParams = (p: Argon2Params) => `m=${p.memoryKiB},t=${p.iterations},p=${p.parallelism}`;

function parseParams(s: string): Argon2Params {
  const m = /^m=([1-9]\d{0,9}),t=([1-9]\d{0,9}),p=([1-9]\d{0,9})$/.exec(s);
  if (!m) throw malformed("vault blob");
  try {
    return checkParams({ memoryKiB: +m[1], iterations: +m[2], parallelism: +m[3] });
  } catch {
    throw malformed("vault blob");
  }
}

function parsePassphraseBlob(blob: string) {
  const parts = typeof blob === "string" ? blob.split("|") : [];
  if (parts.length !== 7 || parts[0] !== "v1" || parts[1] !== "argon2id-a256gcm" || !isAlg(parts[2])) {
    throw malformed("vault blob");
  }
  const params = parseParams(parts[3]);
  let salt: Bytes, iv: Bytes, ct: Bytes;
  try {
    salt = fromB64u(parts[4]);
    iv = fromB64u(parts[5]);
    ct = fromB64u(parts[6]);
  } catch {
    throw malformed("vault blob");
  }
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ct.length < 16) {
    throw malformed("vault blob");
  }
  return { alg: parts[2], params, salt, iv, ct, header: parts.slice(0, 5).join("|") };
}

function parseRecoveryBlob(blob: string) {
  const parts = typeof blob === "string" ? blob.split("|") : [];
  if (parts.length !== 5 || parts[0] !== "v1" || parts[1] !== "recovery-a256gcm" || !isAlg(parts[2])) {
    throw malformed("recovery blob");
  }
  let iv: Bytes, ct: Bytes;
  try {
    iv = fromB64u(parts[3]);
    ct = fromB64u(parts[4]);
  } catch {
    throw malformed("recovery blob");
  }
  if (iv.length !== IV_BYTES || ct.length < 16) throw malformed("recovery blob");
  return { alg: parts[2], iv, ct, header: parts.slice(0, 3).join("|") };
}

/** Argon2id parameters stored in a passphrase blob (to decide whether to raise them). */
export function readVaultKdfParams(passphraseBlob: string): Argon2Params {
  return parsePassphraseBlob(passphraseBlob).params;
}

/** Argon2id(NFKC(passphrase)) -> HKDF -> 32-byte key-encryption key. */
export async function deriveVaultKek(
  passphrase: string,
  params: Argon2Params,
  salt: Uint8Array,
): Promise<Bytes> {
  const p = checkParams(params);
  if (!passphrase) throw authFailed(); // never a valid passphrase; hash-wasm rejects empty input
  const raw = await argon2id({
    password: utf8(passphrase.normalize("NFKC")),
    salt,
    iterations: p.iterations,
    memorySize: p.memoryKiB,
    parallelism: p.parallelism,
    hashLength: KEY_BYTES,
    outputType: "binary",
  });
  return hkdfSha256(raw, new Uint8Array(0), lp(KEK_LABEL), KEY_BYTES);
}

/** Salt/IV-explicit form of the passphrase seal, for known-answer tests. */
export async function sealWithPassphrase(
  pkcs8: Uint8Array,
  alg: KeyAlg,
  passphrase: string,
  params: Argon2Params,
  salt: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  const p = checkParams(params);
  const header = `v1|argon2id-a256gcm|${alg}|${formatParams(p)}|${b64u(salt)}`;
  const kek = await deriveVaultKek(passphrase, p, salt);
  const ct = await aesGcmSeal(kek, iv, utf8(header), pkcs8);
  return `${header}|${b64u(iv)}|${b64u(ct)}`;
}

export async function openWithPassphrase(blob: string, passphrase: string) {
  const b = parsePassphraseBlob(blob);
  const kek = await deriveVaultKek(passphrase, b.params, b.salt);
  const pkcs8 = await aesGcmOpen(kek, b.iv, utf8(b.header), b.ct);
  return { pkcs8, alg: b.alg, params: b.params };
}

const recoveryKek = (rk: Uint8Array) =>
  hkdfSha256(rk, new Uint8Array(0), lp(RECOVERY_LABEL), KEY_BYTES);

export async function sealWithRecoveryKey(
  pkcs8: Uint8Array,
  alg: KeyAlg,
  recoveryKey: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  const header = `v1|recovery-a256gcm|${alg}`;
  const ct = await aesGcmSeal(await recoveryKek(recoveryKey), iv, utf8(header), pkcs8);
  return `${header}|${b64u(iv)}|${b64u(ct)}`;
}

/** Display form: Crockford base32 in dash-separated groups of four. */
export function formatRecoveryKey(rk: Uint8Array): string {
  return base32Encode(rk).match(/.{1,4}/g)!.join("-");
}

export function parseRecoveryKey(s: string): Bytes {
  let rk: Bytes;
  try {
    rk = base32Decode(String(s));
  } catch {
    throw authFailed();
  }
  if (rk.length !== RECOVERY_KEY_BYTES) throw authFailed();
  return rk;
}

export async function openWithRecoveryKey(blob: string, recoveryKey: string) {
  const b = parseRecoveryBlob(blob);
  const rk = parseRecoveryKey(recoveryKey);
  const pkcs8 = await aesGcmOpen(await recoveryKek(rk), b.iv, utf8(b.header), b.ct);
  return { pkcs8, alg: b.alg };
}

function wipe(b: Uint8Array) {
  b.fill(0);
}

export interface CreatedVault {
  /** The unlocked identity (private key is non-extractable). */
  keyPair: KeyPair;
  /** Store on the server next to `keyPair.publicKey`. */
  passphraseBlob: string;
  /** Store on the server; useless without `recoveryKey`. */
  recoveryBlob: string;
  /** Show the user exactly once; never store or transmit it. */
  recoveryKey: string;
}

/** Generate an identity key pair and wrap it under the passphrase and a new recovery key. */
export async function createVault(
  passphrase: string,
  opts: { alg?: KeyAlg; params?: Partial<Argon2Params> } = {},
): Promise<CreatedVault> {
  if (!passphrase) throw invalid("passphrase must not be empty");
  const params = checkParams({ ...DEFAULT_ARGON2_PARAMS, ...opts.params });
  const pair = await generateKeyPair({ alg: opts.alg, extractable: true });
  const pkcs8 = await exportPrivateKey(pair.privateKey);
  try {
    const rk = randomBytes(RECOVERY_KEY_BYTES);
    const [passphraseBlob, recoveryBlob] = await Promise.all([
      sealWithPassphrase(pkcs8, pair.alg, passphrase, params, randomBytes(SALT_BYTES), randomBytes(IV_BYTES)),
      sealWithRecoveryKey(pkcs8, pair.alg, rk, randomBytes(IV_BYTES)),
    ]);
    const keyPair = await importKeyPair(pkcs8, pair.alg);
    const recoveryKey = formatRecoveryKey(rk);
    wipe(rk);
    return { keyPair, passphraseBlob, recoveryBlob, recoveryKey };
  } finally {
    wipe(pkcs8);
  }
}

/**
 * The blob has already authenticated, so the passphrase was right: if the key
 * still will not load, this runtime cannot handle it (X25519 on an older
 * browser). Say that instead of letting it look like a wrong passphrase.
 */
async function importLoadedKey(pkcs8: Uint8Array, alg: KeyAlg): Promise<KeyPair> {
  try {
    return await importKeyPair(pkcs8, alg);
  } catch (e) {
    if (e instanceof CryptoError && e.code === "unsupported") throw e;
    throw new CryptoError("unsupported", "this runtime could not load the vault key");
  }
}

/** Unlock with the passphrase. Throws a generic CryptoError if it is wrong. */
export async function unlockVault(passphraseBlob: string, passphrase: string): Promise<KeyPair> {
  const { pkcs8, alg } = await openWithPassphrase(passphraseBlob, passphrase);
  try {
    return await importLoadedKey(pkcs8, alg as KeyAlg);
  } finally {
    wipe(pkcs8);
  }
}

/** Unlock with the recovery key. */
export async function unlockVaultWithRecoveryKey(
  recoveryBlob: string,
  recoveryKey: string,
): Promise<KeyPair> {
  const { pkcs8, alg } = await openWithRecoveryKey(recoveryBlob, recoveryKey);
  try {
    return await importLoadedKey(pkcs8, alg as KeyAlg);
  } finally {
    wipe(pkcs8);
  }
}

async function resealPassphrase(
  pkcs8: Uint8Array,
  alg: string,
  newPassphrase: string,
  params: Argon2Params,
): Promise<string> {
  if (!newPassphrase) throw invalid("passphrase must not be empty");
  return sealWithPassphrase(
    pkcs8,
    alg as KeyAlg,
    newPassphrase,
    params,
    randomBytes(SALT_BYTES),
    randomBytes(IV_BYTES),
  );
}

/**
 * Re-wrap under a new passphrase (and optionally new Argon2id parameters;
 * defaults to the blob's current ones). The identity key is unchanged.
 */
export async function changePassphrase(
  passphraseBlob: string,
  oldPassphrase: string,
  newPassphrase: string,
  params?: Argon2Params,
): Promise<string> {
  const opened = await openWithPassphrase(passphraseBlob, oldPassphrase);
  try {
    return await resealPassphrase(opened.pkcs8, opened.alg, newPassphrase, params ?? opened.params);
  } finally {
    wipe(opened.pkcs8);
  }
}

/** Forgot the passphrase: use the recovery key to set a new one. */
export async function resetPassphraseWithRecoveryKey(
  recoveryBlob: string,
  recoveryKey: string,
  newPassphrase: string,
  params: Partial<Argon2Params> = {},
): Promise<string> {
  const opened = await openWithRecoveryKey(recoveryBlob, recoveryKey);
  try {
    return await resealPassphrase(
      opened.pkcs8,
      opened.alg,
      newPassphrase,
      checkParams({ ...DEFAULT_ARGON2_PARAMS, ...params }),
    );
  } finally {
    wipe(opened.pkcs8);
  }
}
