import { auth } from "@/lib/auth/auth";
import { eraseAccount, planErasure } from "@/lib/account/erase";
import { REAUTH_ERASE_MESSAGE, signedInRecently } from "@/lib/auth/fresh";
import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { limited } from "@/lib/http/ratelimit";

const json = (body: unknown, status = 200, headers?: Headers) => {
  const h = new Headers(headers);
  h.set("cache-control", "private, no-store");
  return Response.json(body, { status, headers: h });
};

async function who(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  return session ?? json({ error: "Sign in first." }, 401);
}

/** What erasing this account would do to each organisation, so the page can say so before asking. */
export async function GET(request: Request) {
  const s = await who(request);
  if (s instanceof Response) return s;
  const plan = await planErasure(db, s.user.id);
  return json({ email: s.user.email, ...plan });
}

/**
 * Erase the account and what hangs off it (see eraseAccount). Needs a sign-in from the last 15 minutes and the
 * account's email typed back, and is refused, with nothing changed, while the person is the only owner of an
 * organisation that still has other members.
 */
export async function DELETE(request: Request) {
  const s = await who(request);
  if (s instanceof Response) return s;
  const slow = await limited(db, `account-erase:${s.user.id}`, 5, 3_600_000);
  if (slow) return slow;
  if (!signedInRecently(s.session)) return json({ error: REAUTH_ERASE_MESSAGE, code: "RECENT_SIGN_IN_REQUIRED" }, 403);

  const read = await readJsonLimited(request, 1_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const confirm = (read.value as { confirm?: unknown } | null)?.confirm;
  if (typeof confirm !== "string" || confirm.trim().toLowerCase() !== s.user.email.toLowerCase()) {
    return json({ error: "Type your email address exactly to confirm." }, 400);
  }

  const r = await eraseAccount(db, s.user.id);
  if (r.status === "blocked") {
    return json(
      { error: "You are the only owner of an organisation that still has other people. Make someone else an owner, or delete the organisation, first.", blocked: r.blocked },
      409,
    );
  }
  if (r.status === "not-found") return json({ error: "That account no longer exists." }, 404);

  // The session row is gone with the account; this clears the browser's cookie as well.
  const out = await auth.api.signOut({ headers: request.headers, returnHeaders: true }).catch(() => null);
  return json({ ok: true, deleted: r.deleted.length, left: r.left.length }, 200, out?.headers);
}
