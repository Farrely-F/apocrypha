import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { getSession } from "@/lib/auth/session";
import { sameOrigin } from "@/lib/http/origin";
import { can, decideAdmin, sessionWindowMs, type SystemPermission } from "./admin";

export type AdminWho = { userId: string; email: string; twoFactor: boolean };

const asDecision = (s: NonNullable<Awaited<ReturnType<typeof getSession>>>) =>
  decideAdmin({ email: s.user.email, emailVerified: s.user.emailVerified, sessionCreatedAt: s.session.createdAt });

/**
 * For pages. Anyone who is not the administrator, or when the feature is off, gets the ordinary 404: the page
 * does not say that it exists. An administrator whose sign-in is too old is told to sign in again; nothing is shown.
 */
export async function requireAdminPage(): Promise<{ stale: true; minutes: number } | { stale: false; who: AdminWho }> {
  const session = await getSession();
  if (!session) notFound();
  const decision = asDecision(session);
  if (decision.status === "stale") return { stale: true, minutes: sessionWindowMs() / 60_000 };
  if (decision.status !== "ok") notFound();
  return { stale: false, who: { userId: session.user.id, email: session.user.email, twoFactor: Boolean(session.user.twoFactorEnabled) } };
}

/**
 * For the admin API. Not the administrator, or the feature off: 404, the same as an unknown route. Stale: 403 with
 * the code the interface already knows how to explain. The permission is named so a narrower role can be added.
 */
export async function requireAdminRequest(request: Request, permission: SystemPermission): Promise<AdminWho | Response> {
  const none = () => Response.json({ error: "Not found." }, { status: 404, headers: { "cache-control": "private, no-store" } });
  if (!sameOrigin(request)) return none();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return none();
  const decision = asDecision(session);
  if (decision.status === "stale") {
    return Response.json({ error: "Sign in again to use this page.", code: "RECENT_SIGN_IN_REQUIRED" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  }
  if (!can(decision, permission)) return none();
  return { userId: session.user.id, email: session.user.email, twoFactor: Boolean(session.user.twoFactorEnabled) };
}
