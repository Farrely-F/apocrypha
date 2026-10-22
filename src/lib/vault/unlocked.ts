import { isSoftKey, type KeyPair } from "../crypto";
import { announce, clearSession, saveSession } from "./keystore";

// The unlocked identity for this tab. The source of truth across reloads and
// tabs is the keystore (non-extractable key in IndexedDB, with idle and
// absolute expiry); this is the synchronous view of it. <VaultProvider>
// restores it from the keystore on load and clears it when the vault locks.
let current: KeyPair | null = null;
let pending: Promise<void> | null = null;

/**
 * Hold this key pair in memory and persist it to the keystore.
 * `null` locks: the stored key is deleted and other tabs are told to lock.
 * Fire-and-forget; use `unlockWith` / `lock` when you need to await it.
 */
export const setUnlockedKeyPair = (
  keyPair: KeyPair | null,
  opts: { trusted?: boolean } = {},
) => {
  const work =
    keyPair === null
      ? lock()
      : unlockWith(keyPair, opts).catch(() => {
          // Storage may be unavailable (private mode): the key still works in memory.
        });
  const tracked: Promise<void> = work.finally(() => {
    if (pending === tracked) pending = null;
  });
  pending = tracked;
};

export const getUnlockedKeyPair = () => current;

/** Resolves once any fire-and-forget `setUnlockedKeyPair` has reached the keystore. */
export const settled = (): Promise<void> => pending ?? Promise.resolve();

/** Persist and hold a key pair; resolves once it is stored. Memory is set first. */
export async function unlockWith(
  keyPair: KeyPair,
  opts: { trusted?: boolean } = {},
): Promise<void> {
  current = keyPair;
  // An in-memory (soft) key is script-readable, unlike the non-extractable CryptoKey the
  // keystore exists to hold, so it lives only in this tab and a reload locks the vault.
  if (isSoftKey(keyPair.privateKey)) return;
  await saveSession(keyPair, { trusted: opts.trusted === true });
  announce("unlock");
}

/** Drop the key from memory and delete it from the keystore, then tell other tabs. */
export async function lock(): Promise<void> {
  current = null;
  await clearSession();
  announce("lock");
}

/**
 * Set or clear the in-memory key only. For the provider when it restores a
 * session from the keystore, or hears another tab lock.
 */
export function adoptKeyPair(keyPair: KeyPair | null): void {
  current = keyPair;
}
