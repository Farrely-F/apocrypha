import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { readJsonLimited } from "@/lib/http/body";
import { parseNewInvite } from "@/lib/invites/payload";
import { createInvite, listPendingInvites } from "@/lib/invites/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const pending = await listPendingInvites(db, who.userId, orgId);
  return pending ? json({ invites: pending }) : json({ error: "Not found." }, 404);
}

export async function POST(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, 64_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const parsed = parseNewInvite(read.value);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { orgId } = await params;
  const r = await createInvite(db, who.userId, { orgId, ...parsed.value });
  switch (r.status) {
    case "created":
      await audit(db, { orgId, actorId: who.userId, type: "invite.created", data: { inviteId: r.inviteId, emailBound: !!parsed.value.email, environments: parsed.value.grants.length } });
      return json({ inviteId: r.inviteId, expiresAt: r.expiresAt.toISOString() }, 201);
    case "not-found":
      return json({ error: "Not found." }, 404);
    case "forbidden":
      return json({ error: "Only owners and admins can invite." }, 403);
    case "bad-environments":
      return json({ error: "Pick environments in this organisation that you can open." }, 400);
  }
}
