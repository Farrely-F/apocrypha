/**
 * What the tour remembers. Two small flags, both best-effort: storage can be
 * blocked or cleared, and the app has to work the same without it.
 *
 * - `pending` (session): set the moment a brand-new vault is created, so the
 *   tour starts on the first screen after setup and nowhere else.
 * - `seen` (local, per user): the tour was shown, finished or skipped.
 */
export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PENDING = "apocrypha:tour:pending";
const seenKey = (userId: string) => `apocrypha:tour:seen:${userId}`;

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function flagNewVault(session: Store) {
  attempt(() => session.setItem(PENDING, "1"), undefined);
}

export function hasSeen(local: Store, userId: string): boolean {
  return attempt(() => local.getItem(seenKey(userId)) != null, false);
}

export function markSeen(local: Store, userId: string) {
  attempt(() => local.setItem(seenKey(userId), "1"), undefined);
}

/**
 * True once, for a vault that was just made and has not toured yet. The flag
 * is cleared either way so a refresh never replays it.
 */
export function takePending(session: Store, local: Store, userId: string): boolean {
  const pending = attempt(() => session.getItem(PENDING) != null, false);
  if (!pending) return false;
  attempt(() => session.removeItem(PENDING), undefined);
  return !hasSeen(local, userId);
}
