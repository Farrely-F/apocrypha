import { db } from "@/lib/db/client";
import { revokeShare } from "@/lib/share/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ shareId: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { shareId } = await params;
  const r = await revokeShare(db, who.userId, shareId);
  if (r === "ok") return json({ ok: true });
  return r === "forbidden" ? json({ error: "Only owners and admins can revoke." }, 403) : json({ error: "Not found." }, 404);
}
