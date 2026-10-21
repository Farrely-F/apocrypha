import { db } from "@/lib/db/client";
import { listAccess } from "@/lib/members/access";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

/** Who can read or write which environment, for owners and admins (environments they can open). */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const table = await listAccess(db, who.userId, orgId);
  return table ? json(table) : json({ error: "Not found." }, 404);
}
