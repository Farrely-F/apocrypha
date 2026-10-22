/**
 * Plain-language text for the `?error=` code Better Auth puts on the sign-in
 * page after a failed attempt. Unknown codes get a generic message: the raw
 * code is never shown, so nothing from the URL is reflected into the page.
 */
const KNOWN: Record<string, string> = {
  access_denied: "The provider didn't allow the sign-in. If you cancelled it, you can try again.",
  account_not_linked: "That email belongs to an account the provider hasn't verified it for. Sign in the way you did before, then link this provider from Settings.",
  email_not_found: "The provider didn't share an email address. Make one public or verified on that account, then try again.",
  unable_to_create_user: "Your account could not be created. Try again in a moment.",
  state_mismatch: "That sign-in link expired or was opened in a different browser. Start again from here.",
  state_not_found: "That sign-in link expired or was opened in a different browser. Start again from here.",
};

/** The same, for a failed "Link" in Settings (`/settings?error=<code>`). */
const LINK: Record<string, string> = {
  account_already_linked_to_different_user:
    "That login already belongs to another Apocrypha account. Sign out and sign in with it to use that account, or unlink it there first.",
  access_denied: "The provider didn't allow it. If you cancelled, you can try again.",
  state_mismatch: "That link request expired or was opened in a different browser. Start again.",
  state_not_found: "That link request expired or was opened in a different browser. Start again.",
};

export function linkErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return LINK[code] ?? "Linking didn't complete. Try again.";
}

export function signInErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return KNOWN[code] ?? "Sign-in didn't complete. Try again.";
}
