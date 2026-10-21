import {
  changePassphrase,
  resetPassphraseWithRecoveryKey,
  unlockVault,
  unlockVaultWithRecoveryKey,
  type KeyPair,
} from "@/lib/crypto";

export type Me = { publicKey: string; passphraseBlob: string };

async function readError(res: Response, fallback: string) {
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/vault/me", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not reach the server."));
  return (await res.json()) as Me;
}

async function fetchRecoveryBlob(): Promise<string> {
  const res = await fetch("/api/vault/recovery", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not reach the server."));
  return ((await res.json()) as { recoveryBlob: string }).recoveryBlob;
}

/**
 * Upload a new passphrase blob only after proving here that it opens, with the new passphrase, to the
 * same key pair the server knows. The server cannot check that, and a bad blob would lock the user out.
 */
async function saveVerified(me: Me, blob: string, passphrase: string): Promise<KeyPair> {
  const keyPair = await unlockVault(blob, passphrase);
  if (keyPair.publicKey !== me.publicKey) throw new Error("The new passphrase blob did not open to your key. Nothing was saved.");
  const res = await fetch("/api/vault/passphrase", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ previousBlob: me.passphraseBlob, passphraseBlob: blob }),
  });
  if (!res.ok) throw new Error(await readError(res, "The server could not save the new passphrase."));
  return keyPair;
}

/** Forgot the passphrase: the recovery key sets a new one. Returns the unlocked key pair. */
export async function recoverWithKey(me: Me, recoveryKey: string, newPassphrase: string): Promise<KeyPair> {
  const recoveryBlob = await fetchRecoveryBlob();
  const proof = await unlockVaultWithRecoveryKey(recoveryBlob, recoveryKey);
  if (proof.publicKey !== me.publicKey) throw new Error("That recovery key does not belong to this vault.");
  const blob = await resetPassphraseWithRecoveryKey(recoveryBlob, recoveryKey, newPassphrase);
  return saveVerified(me, blob, newPassphrase);
}

/** Unlocked and knows the current one: change it. The key pair is unchanged. */
export async function changeVaultPassphrase(me: Me, current: string, next: string): Promise<KeyPair> {
  const blob = await changePassphrase(me.passphraseBlob, current, next);
  return saveVerified(me, blob, next);
}
