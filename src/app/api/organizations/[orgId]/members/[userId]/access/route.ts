import { audit } from "@/lib/audit/store";
import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { planAccess, setAccess, type AccessChange, type Level } from "@/lib/members/access";
import { UUID } from "@/lib/vault/payload";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };
const LEVELS: readonly string[] = ["none", "read", "write"];

/** What a change involves: the member's current level, their key, the key versions you hold, and who keeps access. GET ?env=<id> */
export async function GET(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { orgId, userId } = await params;
  const envId = new URL(request.url).searchParams.get("env") ?? "";
  if (!UUID.test(envId)) return json({ error: "Send ?env=<environment id>." }, 400);
  const plan = await planAccess(db, who.userId, orgId, userId, envId.toLowerCase());
  switch (plan.status) {
    case "ok":
      return json({ current: plan.current, publicKey: plan.publicKey, currentKeyVersion: plan.currentKeyVersion, keyVersions: plan.keyVersions, recipients: plan.recipients });
    case "forbidden":
      return json({ error: "Only owners and admins can change access." }, 403);
    case "needs-key":
      return json({ error: "You cannot open this environment, so you cannot share it." }, 409);
    case "not-a-member-role":
      return json({ error: "Owners and admins always have full access." }, 400);
    default:
      return json({ error: "Not found." }, 404);
  }
}

/** Set a member's level for one environment: { envId, level, grants?, rotation? }. */
export async function POST(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, 128_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const o = read.value as { envId?: unknown; level?: unknown; grants?: unknown; rotation?: unknown } | null;
  if (!o || typeof o.envId !== "string" || !UUID.test(o.envId) || typeof o.level !== "string" || !LEVELS.includes(o.level)) {
    return json({ error: "Send { envId, level: none | read | write }." }, 400);
  }
  const change: AccessChange = { level: o.level as Level };
  if (o.grants !== undefined) {
    if (!Array.isArray(o.grants) || o.grants.length > 200 || o.grants.some((g) => typeof g?.keyVersion !== "number" || typeof g?.wrappedKey !== "string")) return json({ error: "grants must be [{ keyVersion, wrappedKey }]." }, 400);
    change.grants = o.grants.map((g: { keyVersion: number; wrappedKey: string }) => ({ keyVersion: g.keyVersion, wrappedKey: g.wrappedKey }));
  }
  if (o.rotation !== undefined) {
    if (!Array.isArray(o.rotation) || o.rotation.length > 1000 || o.rotation.some((g) => typeof g?.userId !== "string" || typeof g?.wrappedKey !== "string")) return json({ error: "rotation must be [{ userId, wrappedKey }]." }, 400);
    change.rotation = o.rotation.map((g: { userId: string; wrappedKey: string }) => ({ userId: g.userId, wrappedKey: g.wrappedKey }));
  }
  const { orgId, userId } = await params;
  const envId = o.envId.toLowerCase();
  const r = await setAccess(db, who.userId, orgId, userId, envId, change);
  switch (r.status) {
    case "changed":
      await audit(db, { orgId, actorId: who.userId, type: "member.access_changed", targetUserId: userId, envId, data: { from: r.from, to: r.to, rotated: r.rotated } });
      if (r.rotated) await audit(db, { orgId, actorId: who.userId, type: "env.rotated", envId, targetUserId: userId });
      return json({ from: r.from, to: r.to, rotated: r.rotated });
    case "unchanged":
      return json({ from: change.level, to: change.level, rotated: false });
    case "forbidden":
      return json({ error: "Only owners and admins can change access." }, 403);
    case "needs-key":
      return json({ error: "You cannot open this environment, so you cannot share it." }, 409);
    case "not-a-member-role":
      return json({ error: "Owners and admins always have full access." }, 400);
    case "bad-keys":
      return json({ error: "The keys do not match who should receive them. Reload and try again." }, 400);
    case "stale":
      return json({ error: "The environment key changed while you were working. Reload and try again." }, 409);
    default:
      return json({ error: "Not found." }, 404);
  }
}
