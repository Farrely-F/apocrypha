import { readVaultKdfParams } from "../crypto";

/** Server-side floor for Argon2id cost (OWASP minimum). Default client cost is higher. */
export const MIN_ARGON2 = { memoryKiB: 19456, iterations: 2 } as const;

const MAX_FIELD = 4096;
const FIELDS = ["publicKey", "passphraseBlob", "recoveryBlob", "workspace"] as const;
const BLOB_FIELDS = ["publicKey", "passphraseBlob", "recoveryBlob"] as const;
const WORKSPACE_FIELDS = [
  "envId",
  "wrappedKey",
  "orgName",
  "projectName",
  "environmentName",
] as const;

/** Names are plaintext and shown in the UI: keep them short and printable. */
export const MAX_NAME = 64;

type Alg = "x25519" | "p256";

/** Base64url (no padding) length of n bytes. */
const b64uLen = (n: number) => Math.ceil((n * 4) / 3);
// Ephemeral public key (32 B x25519, 65 B p256) and AES-GCM ciphertext (32 B key + 16 B tag).
const EPH_LEN: Record<Alg, number> = { x25519: b64uLen(32), p256: b64uLen(65) };
const WRAPPED_CT_LEN = b64uLen(48);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64U = /^[A-Za-z0-9_-]+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export type WorkspacePayload = {
  /** Generated in the browser: the wrap binds it, so the server must keep it. */
  envId: string;
  /** Environment key wrapped to the user's own public key, key version 1. */
  wrappedKey: string;
  orgName: string;
  projectName: string;
  environmentName: string;
};

export type VaultPayload = {
  publicKey: string;
  passphraseBlob: string;
  recoveryBlob: string;
  workspace: WorkspacePayload;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export type ParseResult = Parsed<VaultPayload>;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

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
  for (const key of BLOB_FIELDS) {
    const v = body[key];
    if (typeof v !== "string" || v.length === 0) return fail(`${key} must be a non-empty string.`);
    if (v.length > MAX_FIELD) return fail(`${key} is too long.`);
  }
  const { publicKey, passphraseBlob, recoveryBlob } = body as Record<
    (typeof BLOB_FIELDS)[number],
    string
  >;

  const pub = /^v1\|(x25519|p256)\|[A-Za-z0-9_-]+$/.exec(publicKey);
  if (!pub) return fail("publicKey is not a valid v1 public key.");
  const alg = pub[1] as Alg;

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

  const workspace = parseWorkspace(body.workspace, alg);
  if (!workspace.ok) return workspace;

  return { ok: true, value: { publicKey, passphraseBlob, recoveryBlob, workspace: workspace.value } };
}

function parseName(v: unknown, label: string): Parsed<string> {
  if (typeof v !== "string") return fail(`${label} must be a string.`);
  const name = v.trim();
  if (name.length === 0) return fail(`${label} must not be empty.`);
  if (name.length > MAX_NAME) return fail(`${label} is too long.`);
  if (CONTROL.test(name)) return fail(`${label} contains control characters.`);
  return { ok: true, value: name };
}

/**
 * The first environment and its grant. The server cannot open the grant, so it
 * checks shape only: a v1 wrap for the same algorithm as the user's public key.
 */
function parseWorkspace(input: unknown, alg: Alg): Parsed<WorkspacePayload> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail("workspace must be an object.");
  }
  const ws = input as Record<string, unknown>;
  for (const key of Object.keys(ws)) {
    if (!(WORKSPACE_FIELDS as readonly string[]).includes(key)) {
      return fail(`Unexpected workspace field: ${key}.`);
    }
  }

  const { envId, wrappedKey } = ws;
  if (typeof envId !== "string" || !UUID.test(envId)) return fail("workspace.envId must be a UUID.");
  if (typeof wrappedKey !== "string" || wrappedKey.length === 0 || wrappedKey.length > MAX_FIELD) {
    return fail("workspace.wrappedKey must be a wrapped key.");
  }
  // v1|<alg>-hkdf-a256gcm|<ephemeral public>|<ciphertext>
  const parts = wrappedKey.split("|");
  if (
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    parts[1] !== `${alg}-hkdf-a256gcm` ||
    !B64U.test(parts[2]) ||
    parts[2].length !== EPH_LEN[alg] ||
    !B64U.test(parts[3]) ||
    parts[3].length !== WRAPPED_CT_LEN
  ) {
    return fail("workspace.wrappedKey is not a valid v1 wrapped key for this public key.");
  }

  const orgName = parseName(ws.orgName, "workspace.orgName");
  if (!orgName.ok) return orgName;
  const projectName = parseName(ws.projectName, "workspace.projectName");
  if (!projectName.ok) return projectName;
  const environmentName = parseName(ws.environmentName, "workspace.environmentName");
  if (!environmentName.ok) return environmentName;

  return {
    ok: true,
    value: {
      envId: envId.toLowerCase(),
      wrappedKey,
      orgName: orgName.value,
      projectName: projectName.value,
      environmentName: environmentName.value,
    },
  };
}
