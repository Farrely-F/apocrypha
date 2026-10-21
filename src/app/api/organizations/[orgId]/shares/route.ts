import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { clearFinishedShares, listShares } from "@/lib/share/store";
import { UUID } from "@/lib/vault/payload";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

/** Link metadata for owners and admins: when, how many views, status. Never content. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const shares = await listShares(db, who.userId, orgId);
  return shares ? json({ shares }) : json({ error: "Not found." }, 404);
}

/** Remove this environment's finished links: DELETE ?env=<id>. Active links stay. */
export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const envId = new URL(request.url).searchParams.get("env") ?? "";
  if (!UUID.test(envId)) return json({ error: "Send ?env=<environment id>." }, 400);
  const r = await clearFinishedShares(db, who.userId, orgId, envId.toLowerCase());
  if (r.status !== "ok") {
    return r.status === "not-found" ? json({ error: "Not found." }, 404) : json({ error: "Only owners and admins can do that." }, 403);
  }
  if (r.removed > 0) await audit(db, { orgId, actorId: who.userId, type: "share.cleared", envId: envId.toLowerCase(), data: { removed: r.removed } });
  return json({ removed: r.removed });
}
