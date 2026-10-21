import { db } from "@/lib/db/client";
import { listMembers } from "@/lib/members/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const members = await listMembers(db, who.userId, orgId);
  return members ? json({ members, me: who.userId }) : json({ error: "Not found." }, 404);
}
