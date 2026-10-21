import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { clientKey, limited } from "@/lib/http/ratelimit";
import { audit } from "@/lib/audit/store";
import { orgOfInvite } from "@/lib/audit/lookup";
import { parseToken } from "@/lib/invites/payload";
import { getInviteOffer, revokeInvite } from "@/lib/invites/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ inviteId: string }> };

/** What the invited person needs to unwrap. Only for an open invite that is meant for them. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const session = await auth.api.getSession({ headers: request.headers });
  const slow = await limited(db, `invite-open:${session?.user.id ?? clientKey(request)}`, 30, 60_000);
  if (slow) return slow;
  const { inviteId } = await params;
  const offer = session ? await getInviteOffer(db, session.user, inviteId, parseToken(request.headers.get("x-invite-token"))) : null;
  return offer ? json(offer) : json({ error: "This invite is not valid." }, 404);
}

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { inviteId } = await params;
  const orgId = await orgOfInvite(db, inviteId);
  const r = await revokeInvite(db, who.userId, inviteId);
  if (r === "ok") {
    if (orgId) await audit(db, { orgId, actorId: who.userId, type: "invite.revoked", data: { inviteId } });
    return json({ ok: true });
  }
  return r === "forbidden" ? json({ error: "Only owners and admins can revoke." }, 403) : json({ error: "Not found." }, 404);
}
