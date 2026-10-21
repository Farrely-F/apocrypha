// Browser-side sealing and opening of secrets. Pure functions over the crypto
// core: no network, no React, so they can be tested without either.
import { decryptSecretVersion, encryptSecretVersion } from "../crypto";
import type { CreateSecretBody, NewVersionBody } from "./payload";

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
  | { ok: true; id: string; version: number; name: string; value: string; createdAt: number }
  | { ok: false; id: string; version: number; reason: string };

/** One stored version in a secret's history, with who wrote it. Still sealed. */
export type VersionRow = {
  version: number;
  keyVersion: number;
  name: string;
  value: string;
  metadata: string | null;
  deleted: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: number;
};

export type OpenedVersion =
  | { ok: true; version: number; name: string; value: string; deleted: boolean; createdBy: string; createdByName: string; createdAt: number }
  | { ok: false; version: number; reason: string };

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
    return { ok: true, id: row.id, version: row.version, name: opened.name, value: opened.value, createdAt: row.createdAt };
  } catch {
    return { ok: false, id: row.id, version: row.version, reason: "could not be decrypted" };
  }
}

/**
 * Seal `version` of an existing secret (an edit, a restore or, with `deleted`, a
 * delete). The body asks the server to append on top of version - 1.
 */
export async function sealVersion(
  envKey: Uint8Array,
  envId: string,
  secretId: string,
  version: number,
  keyVersion: number,
  name: string,
  value: string,
  deleted = false,
): Promise<NewVersionBody> {
  const sealed = await encryptSecretVersion(envKey, { envId, secretId, version, keyVersion }, { name, value });
  return { baseVersion: version - 1, keyVersion, name: sealed.name, value: sealed.value, metadata: sealed.metadata, deleted };
}

/** Open every version of one secret. Never throws; unreadable rows are reported. */
export async function openHistory(
  keys: ReadonlyMap<number, Uint8Array>,
  envId: string,
  secretId: string,
  rows: readonly VersionRow[],
): Promise<OpenedVersion[]> {
  return Promise.all(
    rows.map(async (row): Promise<OpenedVersion> => {
      const key = keys.get(row.keyVersion);
      if (!key) return { ok: false, version: row.version, reason: "no key for this version" };
      try {
        const o = await decryptSecretVersion(
          key,
          { envId, secretId, version: row.version, keyVersion: row.keyVersion },
          { name: row.name, value: row.value, metadata: row.metadata },
        );
        return {
          ok: true, version: row.version, name: o.name, value: o.value, deleted: row.deleted,
          createdBy: row.createdBy, createdByName: row.createdByName, createdAt: row.createdAt,
        };
      } catch {
        return { ok: false, version: row.version, reason: "could not be decrypted" };
      }
    }),
  );
}
