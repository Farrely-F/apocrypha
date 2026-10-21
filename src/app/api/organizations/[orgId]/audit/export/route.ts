import { db } from "@/lib/db/client";
import { exportAudit } from "@/lib/audit/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

/** The raw chain with its head hash, for owners. Keep the head hash somewhere else to detect later tampering. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const out = await exportAudit(db, who.userId, orgId);
  if (out === "not-found") return json({ error: "Not found." }, 404);
  if (out === "forbidden") return json({ error: "Only an owner can export the audit log." }, 403);
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="apocrypha-audit-${orgId}.json"`, "cache-control": "private, no-store" },
  });
}
