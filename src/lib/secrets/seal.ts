// Browser-side sealing and opening of secrets. Pure functions over the crypto
// core: no network, no React, so they can be tested without either.
import { decryptSecretVersion, encryptSecretVersion } from "../crypto";
import type { CreateSecretBody } from "./payload";

/** One stored version of a secret, as the server returns it (all ciphertext). */
export type SecretRow = {
  id: string;
  version: number;
  keyVersion: number;
  name: string;
  value: string;
  metadata: string | null;
  createdAt: number;
};

export type OpenedSecret =
  | { ok: true; id: string; version: number; name: string; value: string }
  | { ok: false; id: string; version: number; reason: string };

/** Seal a brand-new secret (version 1) under the environment key. */
export async function sealNewSecret(
  envKey: Uint8Array,
  envId: string,
  keyVersion: number,
  name: string,
  value: string,
): Promise<CreateSecretBody> {
  const secretId = crypto.randomUUID();
  const sealed = await encryptSecretVersion(
    envKey,
    { envId, secretId, version: 1, keyVersion },
    { name, value },
  );
  return { secretId, keyVersion, name: sealed.name, value: sealed.value, metadata: sealed.metadata };
}

/**
 * Open one stored version. Never throws: a row that cannot be opened (no key
 * for its version, wrong environment, tampering) is reported so the list can
 * still show everything else.
 */
export async function openSecret(
  keys: ReadonlyMap<number, Uint8Array>,
  envId: string,
  row: SecretRow,
): Promise<OpenedSecret> {
  const key = keys.get(row.keyVersion);
  if (!key) return { ok: false, id: row.id, version: row.version, reason: "no key for this version" };
  try {
    const opened = await decryptSecretVersion(
      key,
      { envId, secretId: row.id, version: row.version, keyVersion: row.keyVersion },
      { name: row.name, value: row.value, metadata: row.metadata },
    );
    return { ok: true, id: row.id, version: row.version, name: opened.name, value: opened.value };
  } catch {
    return { ok: false, id: row.id, version: row.version, reason: "could not be decrypted" };
  }
}
