import { db } from "@/lib/db/client";
import { listShares } from "@/lib/share/store";
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
