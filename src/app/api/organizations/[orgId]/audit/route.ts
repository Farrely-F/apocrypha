import { db } from "@/lib/db/client";
import { listAudit, pruneAudit, verifyOrgChain } from "@/lib/audit/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

const prunedAt = new Map<string, number>();

/** Newest first. Owners and admins see the org, members their own environments and themselves. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const url = new URL(request.url);
  const before = Number(url.searchParams.get("before")) || undefined;
  const result = await listAudit(db, who.userId, orgId, { before });
  if (!result) return json({ error: "Not found." }, 404);

  // Retention runs lazily, at most once an hour per organisation per server process.
  if (Date.now() - (prunedAt.get(orgId) ?? 0) > 3_600_000) {
    prunedAt.set(orgId, Date.now());
    await pruneAudit(db, orgId).catch(() => 0);
  }
  // Only the people who can see the whole log are told whether the whole chain still verifies.
  const chain = result.scope === "org" ? await verifyOrgChain(db, orgId) : null;
  return json({ scope: result.scope, chain, events: result.events.map(({ prevHash: _p, organizationId: _o, ...e }) => e) });
}
