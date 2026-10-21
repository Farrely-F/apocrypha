// Browser-side calls for secrets. The server only ever sees ciphertext.
import { unwrapEnvironmentKey, type KeyPair } from "../crypto";
import type { CreateSecretBody, NewVersionBody } from "./payload";
import type { SecretRow, VersionRow } from "./seal";

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/** Unwrap every copy of the environment key this account holds, by key version. */
export async function fetchEnvironmentKeys(envId: string, keyPair: KeyPair): Promise<Map<number, Uint8Array>> {
  const res = await fetch(`/api/environments/${envId}/key`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load this environment's key."));
  const { grants } = (await res.json()) as { grants: { keyVersion: number; wrappedKey: string }[] };
  const keys = new Map<number, Uint8Array>();
  for (const g of grants) {
    keys.set(g.keyVersion, await unwrapEnvironmentKey(g.wrappedKey, keyPair, { envId, keyVersion: g.keyVersion }));
  }
  return keys;
}

export async function fetchSecrets(envId: string): Promise<SecretRow[]> {
  const res = await fetch(`/api/environments/${envId}/secrets`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load secrets."));
  return ((await res.json()) as { secrets: SecretRow[] }).secrets;
}

export async function postSecret(envId: string, body: CreateSecretBody): Promise<void> {
  const res = await fetch(`/api/environments/${envId}/secrets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "The server could not save the secret."));
}

export async function fetchHistory(envId: string, secretId: string): Promise<VersionRow[]> {
  const res = await fetch(`/api/environments/${envId}/secrets/${secretId}/versions`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load the history."));
  return ((await res.json()) as { versions: VersionRow[] }).versions;
}

export type PostVersionResult =
  | { ok: true; version: number }
  | { ok: false; conflict: VersionRow }
  | { ok: false; error: string };

/** Append a version. A conflict (someone else saved first) comes back as data, not an error. */
export async function postVersion(envId: string, secretId: string, body: NewVersionBody): Promise<PostVersionResult> {
  const res = await fetch(`/api/environments/${envId}/secrets/${secretId}/versions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true, version: ((await res.json()) as { version: number }).version };
  const data = (await res.json().catch(() => null)) as { error?: string; latest?: VersionRow } | null;
  if (res.status === 409 && data?.error === "conflict" && data.latest) return { ok: false, conflict: data.latest };
  return { ok: false, error: data?.error ?? "The server could not save the change." };
}

/** Create several secrets in one all-or-nothing request. */
export async function postBatch(envId: string, secrets: CreateSecretBody[]): Promise<void> {
  const res = await fetch(`/api/environments/${envId}/secrets/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secrets }),
  });
  if (!res.ok) throw new Error(await readError(res, "The server could not save the import."));
}
