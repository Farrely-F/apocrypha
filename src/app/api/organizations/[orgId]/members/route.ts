import { db } from "@/lib/db/client";
import { pendingRegrants } from "@/lib/members/regrant";
import { listMembers } from "@/lib/members/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId } = await params;
  const members = await listMembers(db, who.userId, orgId);
  if (!members) return json({ error: "Not found." }, 404);
  // Owners and admins also learn who is waiting for access after resetting their vault.
  return json({ members, me: who.userId, needsAccess: (await pendingRegrants(db, who.userId, orgId)) ?? [] });
}
