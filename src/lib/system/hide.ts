import { adminEnabled, decideAdmin } from "./admin";

type SessionLike = { user: { email: string; emailVerified: boolean }; session: { createdAt: Date | string | number } } | null;

/**
 * Whether the request for an admin page should be answered as if the page did not exist. True unless the feature is
 * on and the session is the administrator's (a stale sign-in is let through: the page itself asks to sign in again).
 *
 * This runs in the proxy, before any of the response is sent. A page that calls notFound() once it is streaming has
 * already sent "200", and a 200 on /admin next to a 404 on every other unknown path would say the page exists.
 */
export async function hideAdminPage(getSession: () => Promise<SessionLike>, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  if (!adminEnabled(env)) return true; // no session lookup at all when it is off
  const s = await getSession().catch(() => null);
  if (!s) return true;
  const { status } = decideAdmin({ email: s.user.email, emailVerified: s.user.emailVerified, sessionCreatedAt: s.session.createdAt }, env);
  return status !== "ok" && status !== "stale";
}

export const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/** A path no route serves, so a rewrite to it gets the ordinary not-found response, status and all. */
export const NOT_FOUND_PATH = "/__no_such_page__";
