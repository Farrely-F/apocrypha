import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfEnv } from "@/lib/audit/lookup";
import { readJsonLimited } from "@/lib/http/body";
import { MAX_ENVELOPE, parseNewShare } from "@/lib/share/payload";
import { createShare } from "@/lib/share/store";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ envId: string }> };

/** Store a sealed snapshot and its limits. The link (with its key) is assembled in the browser. */
export async function POST(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, MAX_ENVELOPE + 2_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const parsed = parseNewShare(read.value);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { envId } = await params;
  const r = await createShare(db, who.userId, envId, parsed.value);
  switch (r.status) {
    case "created": {
      const orgId = await orgOfEnv(db, envId);
      if (orgId) await audit(db, { orgId, actorId: who.userId, type: "share.created", envId, data: { shareId: r.id, items: parsed.value.itemCount, passwordProtected: parsed.value.passwordProtected, maxViews: parsed.value.maxViews, expires: !!r.expiresAt } });
      return json({ id: r.id, expiresAt: r.expiresAt?.toISOString() ?? null }, 201);
    }
    case "not-found":
      return json({ error: "Not found." }, 404);
    case "forbidden":
      return json({ error: "Only owners and admins can share." }, 403);
    case "exists":
      return json({ error: "That link id is already taken. Try again." }, 409);
  }
}
