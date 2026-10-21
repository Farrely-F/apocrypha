/**
 * Plain-language text for the `?error=` code Better Auth puts on the sign-in
 * page after a failed attempt. Unknown codes get a generic message: the raw
 * code is never shown, so nothing from the URL is reflected into the page.
 */
const KNOWN: Record<string, string> = {
  access_denied: "GitHub didn't allow the sign-in. If you cancelled it, you can try again.",
  account_not_linked: "That email is already used by another sign-in method on this server. Use the method you signed up with.",
  email_not_found: "GitHub didn't share an email address. Make one public or verified on your GitHub account, then try again.",
  unable_to_create_user: "Your account could not be created. Try again in a moment.",
  state_mismatch: "That sign-in link expired or was opened in a different browser. Start again from here.",
  state_not_found: "That sign-in link expired or was opened in a different browser. Start again from here.",
};

export function signInErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return KNOWN[code] ?? "Sign-in didn't complete. Try again.";
}
