import type { KeyPair } from "../crypto";

// In-memory only: survives client-side navigation, gone on reload. Persisting
// the key (non-extractable, in IndexedDB) and idle auto-lock belong to the
// unlock ticket (#5), which replaces this.
let current: KeyPair | null = null;

export const setUnlockedKeyPair = (keyPair: KeyPair | null) => {
  current = keyPair;
};

export const getUnlockedKeyPair = () => current;
