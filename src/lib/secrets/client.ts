// Browser-side calls for secrets. The server only ever sees ciphertext.
import { unwrapEnvironmentKey, type KeyPair } from "../crypto";
import type { CreateSecretBody } from "./payload";
import type { SecretRow } from "./seal";

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
