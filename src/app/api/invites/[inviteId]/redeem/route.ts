import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { limited } from "@/lib/http/ratelimit";
import { audit } from "@/lib/audit/store";
import { readJsonLimited } from "@/lib/http/body";
import { parseRedeem, parseToken } from "@/lib/invites/payload";
import { redeemInvite } from "@/lib/invites/store";
import { getVaultRecord } from "@/lib/vault/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ inviteId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const slow = await limited(db, `invite-redeem:${session.user.id}`, 20, 60_000);
  if (slow) return slow;
  const vault = await getVaultRecord(db, session.user.id);
  if (!vault) return json({ error: "Create your vault first." }, 409);
  const read = await readJsonLimited(request, 64_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const parsed = parseRedeem(read.value, vault.publicKey.split("|")[1] === "p256" ? "p256" : "x25519");
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { inviteId } = await params;
  const r = await redeemInvite(db, session.user, inviteId, parseToken(request.headers.get("x-invite-token")), parsed.value);
  switch (r.status) {
    case "joined":
      await audit(db, { orgId: r.orgId, actorId: session.user.id, targetUserId: session.user.id, type: "member.joined", data: { inviteId } });
      return json({ orgId: r.orgId });
    case "already-member":
      return json({ error: "You are already in this organisation." }, 409);
    case "bad-grants":
      return json({ error: "That does not match the invite." }, 400);
    case "not-found":
      return json({ error: "This invite is not valid." }, 404);
  }
}
