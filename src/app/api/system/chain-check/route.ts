import { db } from "@/lib/db/client";
import { limited } from "@/lib/http/ratelimit";
import { logAdminAccess } from "@/lib/system/access-log";
import { requireAdminRequest } from "@/lib/system/guard";
import { checkAuditChains } from "@/lib/system/overview";

const headers = { "cache-control": "private, no-store" };

/** Verify the recent audit chains: bounded to 25 organisations and 5,000 events each. Logged, and rate-limited. */
export async function POST(request: Request) {
  const who = await requireAdminRequest(request, "health.run_chain_check");
  if (who instanceof Response) return who;
  const slow = await limited(db, `system-chain-check:${who.userId}`, 12, 3_600_000);
  if (slow) return slow;
  await logAdminAccess(db, { actorId: who.userId, action: "run_chain_check" });
  return Response.json(await checkAuditChains(db), { headers });
}
