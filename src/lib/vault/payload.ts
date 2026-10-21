import { readVaultKdfParams } from "../crypto";

/** Server-side floor for Argon2id cost (OWASP minimum). Default client cost is higher. */
export const MIN_ARGON2 = { memoryKiB: 19456, iterations: 2 } as const;

const MAX_FIELD = 4096;
const FIELDS = ["publicKey", "passphraseBlob", "recoveryBlob"] as const;

export type VaultPayload = {
  publicKey: string;
  passphraseBlob: string;
  recoveryBlob: string;
};

export type ParseResult = { ok: true; value: VaultPayload } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

/**
 * Validate a create-vault request. The server cannot check that a blob decrypts
 * (it never has the key), so this checks shape, size, algorithm agreement and a
 * minimum KDF cost, and refuses any field it does not expect.
 */
export function parseVaultPayload(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail("Request body must be a JSON object.");
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!(FIELDS as readonly string[]).includes(key)) return fail(`Unexpected field: ${key}.`);
  }
  for (const key of FIELDS) {
    const v = body[key];
    if (typeof v !== "string" || v.length === 0) return fail(`${key} must be a non-empty string.`);
    if (v.length > MAX_FIELD) return fail(`${key} is too long.`);
  }
  const { publicKey, passphraseBlob, recoveryBlob } = body as VaultPayload;

  const pub = /^v1\|(x25519|p256)\|[A-Za-z0-9_-]+$/.exec(publicKey);
  if (!pub) return fail("publicKey is not a valid v1 public key.");
  const alg = pub[1];

  // v1|argon2id-a256gcm|<alg>|m=..,t=..,p=..|salt|iv|ct
  const pass = passphraseBlob.split("|");
  if (pass.length !== 7 || pass[0] !== "v1" || pass[1] !== "argon2id-a256gcm" || pass[2] !== alg) {
    return fail("passphraseBlob is not a valid vault blob for this public key.");
  }
  // v1|recovery-a256gcm|<alg>|iv|ct
  const rec = recoveryBlob.split("|");
  if (rec.length !== 5 || rec[0] !== "v1" || rec[1] !== "recovery-a256gcm" || rec[2] !== alg) {
    return fail("recoveryBlob is not a valid recovery blob for this public key.");
  }

  let params;
  try {
    params = readVaultKdfParams(passphraseBlob);
  } catch {
    return fail("passphraseBlob has invalid key derivation parameters.");
  }
  if (params.memoryKiB < MIN_ARGON2.memoryKiB || params.iterations < MIN_ARGON2.iterations) {
    return fail("Key derivation cost is below the minimum (memory or iterations too low).");
  }

  return { ok: true, value: { publicKey, passphraseBlob, recoveryBlob } };
}
