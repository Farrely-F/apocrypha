import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfShare } from "@/lib/audit/lookup";
import { revokeShare } from "@/lib/share/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ shareId: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { shareId } = await params;
  const s = await orgOfShare(db, shareId);
  const r = await revokeShare(db, who.userId, shareId);
  if (r === "ok") {
    if (s) await audit(db, { orgId: s.orgId, actorId: who.userId, type: "share.revoked", envId: s.envId, data: { shareId } });
    return json({ ok: true });
  }
  return r === "forbidden" ? json({ error: "Only owners and admins can revoke." }, 403) : json({ error: "Not found." }, 404);
}
