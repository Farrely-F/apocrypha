/**
 * Per-secret-version encryption.
 *
 *   subkey = HKDF-SHA-256(environment key, info = lp(label, env_id, secret_id, version, key_version))
 *   field  = v1|a256gcm|<iv>|<AES-256-GCM(subkey, iv, aad = lp(label, field, env_id, secret_id, version, key_version))>
 */
import { b64u, type Bytes, fromB64u, fromUtf8, lp, randomBytes, utf8 } from "./encoding";
import { authFailed, invalid, malformed } from "./errors";
import { aesGcmOpen, aesGcmSeal, hkdfSha256, IV_BYTES, KEY_BYTES } from "./primitives";

/** Maximum size of any single plaintext field, in UTF-8 bytes (64 KB). */
export const MAX_SECRET_VALUE_BYTES = 65536;

export interface SecretContext {
  envId: string;
  secretId: string;
  /** Secret version number (uint32). */
  version: number;
  /** Environment key version used to encrypt (uint32). */
  keyVersion: number;
}

export interface SecretFields {
  name: string;
  value: string;
  metadata?: string | null;
}

export interface EncryptedSecretVersion {
  name: string;
  value: string;
  /** `null` when the version has no metadata. */
  metadata: string | null;
}

export type SecretField = "name" | "value" | "meta";

const SUBKEY_LABEL = "apocrypha/v1/secret-subkey";
const AAD_LABEL = "apocrypha/v1/secret-aad";

function checkContext(ctx: SecretContext) {
  const u32 = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xffff_ffff;
  if (!ctx.envId || !ctx.secretId || typeof ctx.envId !== "string" || typeof ctx.secretId !== "string") {
    throw invalid("envId and secretId are required");
  }
  if (!u32(ctx.version) || !u32(ctx.keyVersion)) {
    throw invalid("version and keyVersion must be uint32 integers");
  }
}

function checkKey(envKey: Uint8Array) {
  if (!(envKey instanceof Uint8Array) || envKey.length !== KEY_BYTES) {
    throw invalid("environment key must be 32 bytes");
  }
}

/** HKDF subkey for one secret version. Exported for known-answer tests. */
export async function deriveSecretSubkey(envKey: Uint8Array, ctx: SecretContext): Promise<Bytes> {
  checkKey(envKey);
  checkContext(ctx);
  const info = lp(SUBKEY_LABEL, ctx.envId, ctx.secretId, ctx.version, ctx.keyVersion);
  return hkdfSha256(envKey, new Uint8Array(0), info, KEY_BYTES);
}

const aadFor = (field: SecretField, ctx: SecretContext) =>
  lp(AAD_LABEL, field, ctx.envId, ctx.secretId, ctx.version, ctx.keyVersion);

/** Deterministic-IV form of field encryption, for known-answer tests only. */
export async function encryptFieldWithIv(
  envKey: Uint8Array,
  ctx: SecretContext,
  field: SecretField,
  plaintext: string,
  iv: Uint8Array,
): Promise<string> {
  const bytes = utf8(plaintext);
  if (bytes.length > MAX_SECRET_VALUE_BYTES) throw invalid("value exceeds 64 KB");
  const subkey = await deriveSecretSubkey(envKey, ctx);
  const ct = await aesGcmSeal(subkey, iv, aadFor(field, ctx), bytes);
  return `v1|a256gcm|${b64u(iv)}|${b64u(ct)}`;
}

export async function decryptField(
  envKey: Uint8Array,
  ctx: SecretContext,
  field: SecretField,
  blob: string,
): Promise<string> {
  const parts = typeof blob === "string" ? blob.split("|") : [];
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== "a256gcm") {
    throw malformed("secret field");
  }
  let iv: Bytes;
  let ct: Bytes;
  try {
    iv = fromB64u(parts[2]);
    ct = fromB64u(parts[3]);
  } catch {
    throw malformed("secret field");
  }
  if (iv.length !== IV_BYTES || ct.length < 16) throw malformed("secret field");
  const subkey = await deriveSecretSubkey(envKey, ctx);
  const pt = await aesGcmOpen(subkey, iv, aadFor(field, ctx), ct);
  try {
    return fromUtf8(pt);
  } catch {
    throw authFailed();
  }
}

const encryptField = (envKey: Uint8Array, ctx: SecretContext, field: SecretField, text: string) =>
  encryptFieldWithIv(envKey, ctx, field, text, randomBytes(IV_BYTES));

/** Encrypt the name, value and optional metadata of one secret version. */
export async function encryptSecretVersion(
  envKey: Uint8Array,
  ctx: SecretContext,
  fields: SecretFields,
): Promise<EncryptedSecretVersion> {
  const [name, value, metadata] = await Promise.all([
    encryptField(envKey, ctx, "name", fields.name),
    encryptField(envKey, ctx, "value", fields.value),
    fields.metadata == null ? null : encryptField(envKey, ctx, "meta", fields.metadata),
  ]);
  return { name, value, metadata };
}

/** Decrypt one secret version. Fails unless `ctx` equals the encryption context. */
export async function decryptSecretVersion(
  envKey: Uint8Array,
  ctx: SecretContext,
  enc: EncryptedSecretVersion,
): Promise<{ name: string; value: string; metadata: string | null }> {
  const [name, value, metadata] = await Promise.all([
    decryptField(envKey, ctx, "name", enc.name),
    decryptField(envKey, ctx, "value", enc.value),
    enc.metadata == null ? null : decryptField(envKey, ctx, "meta", enc.metadata),
  ]);
  return { name, value, metadata };
}
