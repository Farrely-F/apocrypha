import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { getInviteOffer, revokeInvite } from "@/lib/invites/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ inviteId: string }> };

/** What the invited person needs to unwrap. Only for an open invite that is meant for them. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const session = await auth.api.getSession({ headers: request.headers });
  const { inviteId } = await params;
  const offer = session ? await getInviteOffer(db, session.user, inviteId) : null;
  return offer ? json(offer) : json({ error: "This invite is not valid." }, 404);
}

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { inviteId } = await params;
  const r = await revokeInvite(db, who.userId, inviteId);
  if (r === "ok") return json({ ok: true });
  return r === "forbidden" ? json({ error: "Only owners and admins can revoke." }, 403) : json({ error: "Not found." }, 404);
}
