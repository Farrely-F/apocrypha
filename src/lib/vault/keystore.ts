/**
 * Browser key store: the unlocked identity, kept as a non-extractable
 * CryptoKey in IndexedDB (DESIGN.md section 11).
 *
 * Framework-free. IndexedDB stores CryptoKey objects by structured clone, so
 * the private key bytes are never readable by script, only usable. What lives
 * here is exactly what an attacker with script access to this origin could use
 * anyway: the lock exists to bound that window, not to defend against XSS.
 *
 * Lock policy, enforced on every read and touch (all timestamps are wall clock
 * milliseconds):
 *   - default: locks after `idleMs` without activity (`lastActive`);
 *   - "trust this device": no idle lock, but an absolute `expiresAt` of
 *     `TRUST_TTL_MS` after unlocking that activity never extends.
 * An expired record is deleted the moment it is seen, never returned.
 */
import type { KeyPair } from "../crypto";

export const DEFAULT_IDLE_MS = 15 * 60 * 1000;
export const TRUST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Positive integer milliseconds, else the 15 minute default. */
export function parseIdleMs(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_IDLE_MS;
}

/**
 * Idle window. `NEXT_PUBLIC_APOCRYPHA_IDLE_MS` overrides it so tests can use a
 * few seconds; unset in production. (Referenced literally so Next inlines it.)
 */
export const IDLE_TIMEOUT_MS = parseIdleMs(process.env.NEXT_PUBLIC_APOCRYPHA_IDLE_MS);

export interface StoredSession {
  keyPair: KeyPair;
  trusted: boolean;
  unlockedAt: number;
  lastActive: number;
  /** Absolute deadline; set only for trusted sessions. */
  expiresAt: number | null;
}

interface Policy {
  now?: number;
  idleMs?: number;
}

const DB_NAME = "apocrypha-keystore";
const STORE = "sessions";
const KEY = "identity";

export function isExpired(s: StoredSession, now: number, idleMs: number): boolean {
  if (s.trusted) {
    // A trusted record must carry a sane absolute deadline; otherwise it is junk.
    if (s.expiresAt == null || s.expiresAt - now > TRUST_TTL_MS) return true;
    return now >= s.expiresAt;
  }
  return now - s.lastActive >= idleMs;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      // Let a future schema upgrade proceed instead of blocking on this tab.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

/** Run `fn` inside one transaction; resolves with its result once it commits. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, done: (v: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result!: T;
      fn(tx.objectStore(STORE), (v) => (result = v));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

/** Replace any stored session with this one. */
export async function saveSession(
  keyPair: KeyPair,
  opts: { trusted: boolean; now?: number },
): Promise<void> {
  const now = opts.now ?? Date.now();
  const session: StoredSession = {
    keyPair,
    trusted: opts.trusted,
    unlockedAt: now,
    lastActive: now,
    expiresAt: opts.trusted ? now + TRUST_TTL_MS : null,
  };
  await withStore<void>("readwrite", (store) => {
    store.put(session, KEY);
  });
}

/**
 * The live session, or null. An expired session is deleted in the same
 * transaction that found it. Resolves null (never throws) if storage is
 * unavailable or corrupt: the safe answer is "locked".
 */
export async function loadSession(policy: Policy = {}): Promise<StoredSession | null> {
  const now = policy.now ?? Date.now();
  const idleMs = policy.idleMs ?? IDLE_TIMEOUT_MS;
  try {
    return await withStore<StoredSession | null>("readwrite", (store, done) => {
      const req = store.get(KEY);
      req.onsuccess = () => {
        const s = req.result as StoredSession | undefined;
        if (!isStoredSession(s) || isExpired(s, now, idleMs)) {
          if (s !== undefined) store.delete(KEY);
          done(null);
        } else {
          done(s);
        }
      };
    });
  } catch {
    return null;
  }
}

/**
 * Record activity. Returns false (and wipes) if the session has already
 * expired or is gone: activity never revives an expired session. Trusted
 * sessions keep their absolute deadline.
 */
export async function touchSession(policy: Policy = {}): Promise<boolean> {
  const now = policy.now ?? Date.now();
  const idleMs = policy.idleMs ?? IDLE_TIMEOUT_MS;
  try {
    return await withStore<boolean>("readwrite", (store, done) => {
      const req = store.get(KEY);
      req.onsuccess = () => {
        const s = req.result as StoredSession | undefined;
        if (!isStoredSession(s) || isExpired(s, now, idleMs)) {
          if (s !== undefined) store.delete(KEY);
          done(false);
          return;
        }
        if (now > s.lastActive) store.put({ ...s, lastActive: now }, KEY);
        done(true);
      };
    });
  } catch {
    return false;
  }
}

/** Delete the stored key. Resolves even if storage is unavailable. */
export async function clearSession(): Promise<void> {
  try {
    await withStore<void>("readwrite", (store) => {
      store.delete(KEY);
    });
  } catch {
    // Nothing stored that we could reach.
  }
}

function isStoredSession(s: unknown): s is StoredSession {
  if (!s || typeof s !== "object") return false;
  const r = s as Partial<StoredSession>;
  return (
    typeof r.trusted === "boolean" &&
    typeof r.lastActive === "number" &&
    typeof r.keyPair?.publicKey === "string" &&
    typeof r.keyPair?.alg === "string" &&
    r.keyPair?.privateKey != null
  );
}

// Cross-tab signalling. The key itself never travels over the channel: "lock"
// means drop it now, "unlock" means look in IndexedDB.
export type VaultEvent = "lock" | "unlock";
const CHANNEL = "apocrypha-vault";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
}

/** Tell the other tabs. A tab does not hear its own announcements. */
export function announce(event: VaultEvent): void {
  getChannel()?.postMessage({ type: event });
}

/** Listen for other tabs locking or unlocking. Returns an unsubscribe. */
export function onVaultEvent(cb: (event: VaultEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (m: MessageEvent) => {
    const t = (m.data as { type?: unknown } | null)?.type;
    if (t === "lock" || t === "unlock") cb(t);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
