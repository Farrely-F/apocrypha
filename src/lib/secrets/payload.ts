import { isUuid } from "../workspace/shared";

/** Longest sealed value: a 64 KB plaintext is ~87 K base64url characters plus framing. */
export const MAX_SEALED_VALUE = 100_000;
export const MAX_SEALED_NAME = 4096;

const FIELDS = ["secretId", "keyVersion", "name", "value", "metadata"] as const;
// v1|a256gcm|<iv>|<ciphertext>, base64url parts (docs/crypto.md section 4).
const SEALED = /^v1\|a256gcm\|[A-Za-z0-9_-]+\|[A-Za-z0-9_-]+$/;

export type CreateSecretBody = {
  secretId: string;
  keyVersion: number;
  name: string;
  value: string;
  metadata: string | null;
};

export type ParseResult = { ok: true; value: CreateSecretBody } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

/**
 * Validate a create-secret request. The server cannot tell whether a sealed
 * field decrypts, but it can refuse anything that is not shaped like one, so a
 * client bug can never store plain text, and it refuses unknown fields.
 */
export function parseCreateSecret(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail("Request body must be a JSON object.");
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!(FIELDS as readonly string[]).includes(key)) return fail(`Unexpected field: ${key}.`);
  }
  if (typeof body.secretId !== "string" || !isUuid(body.secretId)) {
    return fail("secretId must be a UUID.");
  }
  const kv = body.keyVersion;
  if (typeof kv !== "number" || !Number.isInteger(kv) || kv < 1 || kv > 0xffffffff) {
    return fail("keyVersion must be a positive integer.");
  }
  const sealed = (v: unknown, max: number, label: string): string | null => {
    if (typeof v !== "string" || v.length > max || !SEALED.test(v)) {
      throw new Error(`${label} must be a sealed v1 field of at most ${max} characters.`);
    }
    return v;
  };
  try {
    const name = sealed(body.name, MAX_SEALED_NAME, "name") as string;
    const value = sealed(body.value, MAX_SEALED_VALUE, "value") as string;
    const metadata =
      body.metadata === undefined || body.metadata === null
        ? null
        : sealed(body.metadata, MAX_SEALED_VALUE, "metadata");
    return { ok: true, value: { secretId: body.secretId, keyVersion: kv, name, value, metadata } };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Most secrets one request may create. */
export const MAX_BATCH = 500;

export type NewVersionBody = {
  /** The version the editor was looking at; the server only appends on top of it. */
  baseVersion: number;
  keyVersion: number;
  name: string;
  value: string;
  metadata: string | null;
  /** True for a delete: a tombstone version, history is kept. */
  deleted: boolean;
};

export type ParseVersionResult = { ok: true; value: NewVersionBody } | { ok: false; error: string };

const VERSION_FIELDS = ["baseVersion", "keyVersion", "name", "value", "metadata", "deleted"] as const;

/** Validate a new-version request (edit, restore or delete). Ciphertext only. */
export function parseNewVersion(input: unknown): ParseVersionResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!(VERSION_FIELDS as readonly string[]).includes(key)) return { ok: false, error: `Unexpected field: ${key}.` };
  }
  const base = body.baseVersion;
  if (typeof base !== "number" || !Number.isInteger(base) || base < 1 || base >= 0xffffffff) {
    return { ok: false, error: "baseVersion must be a positive integer." };
  }
  if (body.deleted !== undefined && typeof body.deleted !== "boolean") {
    return { ok: false, error: "deleted must be true or false." };
  }
  // Reuse the create-secret rules for the sealed fields and key version.
  const sealed = parseCreateSecret({
    secretId: "00000000-0000-4000-8000-000000000000",
    keyVersion: body.keyVersion,
    name: body.name,
    value: body.value,
    metadata: body.metadata,
  });
  if (!sealed.ok) return sealed;
  const { keyVersion, name, value, metadata } = sealed.value;
  return { ok: true, value: { baseVersion: base, keyVersion, name, value, metadata, deleted: body.deleted === true } };
}

export type ParseBatchResult = { ok: true; value: CreateSecretBody[] } | { ok: false; error: string };

/** Validate a batch of new secrets: 1 to MAX_BATCH, each valid, ids unique. */
export function parseBatch(input: unknown): ParseBatchResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key !== "secrets") return { ok: false, error: `Unexpected field: ${key}.` };
  }
  const list = body.secrets;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "secrets must be a non-empty array." };
  if (list.length > MAX_BATCH) return { ok: false, error: `At most ${MAX_BATCH} secrets per request.` };
  const out: CreateSecretBody[] = [];
  const seen = new Set<string>();
  for (const [i, item] of list.entries()) {
    const r = parseCreateSecret(item);
    if (!r.ok) return { ok: false, error: `secrets[${i}]: ${r.error}` };
    if (seen.has(r.value.secretId)) return { ok: false, error: `secrets[${i}]: duplicate secretId.` };
    seen.add(r.value.secretId);
    out.push(r.value);
  }
  return { ok: true, value: out };
}
