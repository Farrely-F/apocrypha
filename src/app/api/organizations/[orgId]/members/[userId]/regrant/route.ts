import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { applyRegrant, planRegrant, type RegrantEnv } from "@/lib/members/regrant";
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
  const read = await readJsonLimited(request, 512_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const envs = parseEnvs((read.value as { envs?: unknown } | null)?.envs);
  if (!envs) return json({ error: "Send { envs: [{ envId, forTarget: [{ keyVersion, wrappedKey }], forOthers: [{ userId, wrappedKey }] }] }." }, 400);
  const { orgId, userId } = await params;
  const r = await applyRegrant(db, who.userId, orgId, userId, envs);
  switch (r.status) {
    case "granted":
      return json({ envIds: r.envIds });
    case "forbidden":
      return json({ error: "Only owners and admins can do that." }, 403);
    case "bad-grants":
      return json({ error: "The keys do not match who should receive them. Reload and try again." }, 400);
    case "stale":
      return json({ error: "An environment key changed while you were working. Reload and try again." }, 409);
    default:
      return json({ error: "Not found." }, 404);
  }
}

function parseEnvs(v: unknown): RegrantEnv[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 200) return null;
  const out: RegrantEnv[] = [];
  for (const e of v) {
    const o = e as { envId?: unknown; forTarget?: unknown; forOthers?: unknown } | null;
    if (!o || typeof o.envId !== "string" || !UUID.test(o.envId) || !Array.isArray(o.forTarget) || !Array.isArray(o.forOthers) || o.forTarget.length > 200 || o.forOthers.length > 1000) return null;
    const forTarget: RegrantEnv["forTarget"] = [];
    for (const g of o.forTarget) {
      const x = g as { keyVersion?: unknown; wrappedKey?: unknown } | null;
      if (!x || typeof x.keyVersion !== "number" || !Number.isInteger(x.keyVersion) || typeof x.wrappedKey !== "string") return null;
      forTarget.push({ keyVersion: x.keyVersion, wrappedKey: x.wrappedKey });
    }
    const forOthers: RegrantEnv["forOthers"] = [];
    for (const g of o.forOthers) {
      const x = g as { userId?: unknown; wrappedKey?: unknown } | null;
      if (!x || typeof x.userId !== "string" || x.userId.length > 100 || typeof x.wrappedKey !== "string") return null;
      forOthers.push({ userId: x.userId, wrappedKey: x.wrappedKey });
    }
    out.push({ envId: o.envId.toLowerCase(), forTarget, forOthers });
  }
  return out;
}
