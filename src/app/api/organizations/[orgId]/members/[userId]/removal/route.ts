import { db } from "@/lib/db/client";
import { planRemoval } from "@/lib/members/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

/** What removing this member needs: which environments rotate and who receives each new key. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId, userId } = await params;
  const plan = await planRemoval(db, who.userId, orgId, userId);
  switch (plan.status) {
    case "ok":
      return json({ environments: plan.environments });
    case "not-found":
      return json({ error: "Not found." }, 404);
    case "forbidden":
      return json({ error: "You cannot remove this member." }, 403);
    case "needs-key":
      return json({ error: `You cannot open ${plan.environments.join(", ")}, so you cannot rotate it. Ask someone who can.` }, 409);
  }
}
