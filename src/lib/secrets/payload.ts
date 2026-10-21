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
