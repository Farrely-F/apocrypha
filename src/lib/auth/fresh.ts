/** How recently someone must have signed in to do something that can lock them out of their vault. */
export const FRESH_SIGN_IN_MS = 15 * 60 * 1000;

/**
 * True when the session was created (a real sign-in, not a refresh) within `maxAgeMs`.
 * A stolen session cookie should not be enough to overwrite a passphrase blob.
 */
export function signedInRecently(session: { createdAt: Date | string | number }, now = Date.now(), maxAgeMs = FRESH_SIGN_IN_MS) {
  const created = new Date(session.createdAt).getTime();
  return Number.isFinite(created) && now - created <= maxAgeMs && now >= created - 60_000;
}

export const REAUTH_MESSAGE = "For your safety, sign out and sign in again, then retry. Changing the passphrase needs a sign-in from the last 15 minutes.";
