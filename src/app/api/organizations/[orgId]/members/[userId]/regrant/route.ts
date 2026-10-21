import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { applyRegrant, planRegrant } from "@/lib/members/regrant";
import { UUID } from "@/lib/vault/payload";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

/** What re-sharing with this member needs: their new public key, and every key version you hold per environment. */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId, userId } = await params;
  const plan = await planRegrant(db, who.userId, orgId, userId);
  switch (plan.status) {
    case "ok":
      return json({ publicKey: plan.publicKey, environments: plan.environments, skipped: plan.skipped });
    case "forbidden":
      return json({ error: "Only owners and admins can do that." }, 403);
    case "nothing":
      return json({ error: "Nothing to share with this member." }, 404);
    case "not-found":
      return json({ error: "Not found." }, 404);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, 128_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const list = (read.value as { grants?: unknown } | null)?.grants;
  if (!Array.isArray(list) || list.length > 500) return json({ error: "Send { grants: [{ envId, keyVersion, wrappedKey }] }." }, 400);
  const grants: { envId: string; keyVersion: number; wrappedKey: string }[] = [];
  for (const g of list) {
    const o = g as { envId?: unknown; keyVersion?: unknown; wrappedKey?: unknown } | null;
    if (!o || typeof o.envId !== "string" || !UUID.test(o.envId) || typeof o.keyVersion !== "number" || !Number.isInteger(o.keyVersion) || typeof o.wrappedKey !== "string") {
      return json({ error: "Each grant needs envId, keyVersion and wrappedKey." }, 400);
    }
    grants.push({ envId: o.envId.toLowerCase(), keyVersion: o.keyVersion, wrappedKey: o.wrappedKey });
  }
  const { orgId, userId } = await params;
  const r = await applyRegrant(db, who.userId, orgId, userId, grants);
  switch (r.status) {
    case "granted":
      return json({ envIds: r.envIds });
    case "forbidden":
      return json({ error: "Only owners and admins can do that." }, 403);
    case "bad-grants":
      return json({ error: "The keys do not match what this member should receive. Reload and try again." }, 400);
    default:
      return json({ error: "Not found." }, 404);
  }
}
