import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { changeRole, removeMember, type Rotation } from "@/lib/members/store";
import { UUID } from "@/lib/vault/payload";
import { guard, json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, 1_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const o = read.value as { role?: unknown } | null;
  const { orgId, userId } = await params;
  const r = await changeRole(db, who.userId, orgId, userId, typeof o?.role === "string" ? o.role : "");
  if (r === "ok") return json({ ok: true });
  if (r === "bad-role") return json({ error: "Role must be admin or member." }, 400);
  return r === "forbidden" ? json({ error: "Only an owner can change roles." }, 403) : json({ error: "Not found." }, 404);
}

function parseRotations(v: unknown): Rotation[] | null {
  const list = (v as { rotations?: unknown } | null)?.rotations;
  if (!Array.isArray(list) || list.length > 200) return null;
  const out: Rotation[] = [];
  for (const r of list) {
    const o = r as { envId?: unknown; grants?: unknown } | null;
    if (!o || typeof o.envId !== "string" || !UUID.test(o.envId) || !Array.isArray(o.grants) || o.grants.length > 1000) return null;
    const grants: Rotation["grants"] = [];
    for (const g of o.grants) {
      const x = g as { userId?: unknown; wrappedKey?: unknown } | null;
      if (!x || typeof x.userId !== "string" || typeof x.wrappedKey !== "string" || x.userId.length > 100) return null;
      grants.push({ userId: x.userId, wrappedKey: x.wrappedKey });
    }
    out.push({ envId: o.envId.toLowerCase(), grants });
  }
  return out;
}

/** Remove a member. The body carries the new environment keys, wrapped by this admin's browser. */
export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, 512_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const rotations = parseRotations(read.value);
  if (!rotations) return json({ error: "Send { rotations: [{ envId, grants: [{ userId, wrappedKey }] }] }." }, 400);
  const { orgId, userId } = await params;
  const r = await removeMember(db, who.userId, orgId, userId, rotations);
  switch (r.status) {
    case "removed":
      return json({ rotated: r.rotated });
    case "not-found":
      return json({ error: "Not found." }, 404);
    case "forbidden":
      return json({ error: "You cannot remove this member." }, 403);
    case "needs-key":
      return json({ error: `You cannot open ${r.environments.join(", ")}, so you cannot rotate it. Ask someone who can.` }, 409);
    case "stale":
      return json({ error: "An environment key changed while you were working. Reload and try again." }, 409);
    case "bad-rotation":
      return json({ error: "The new keys do not match who should hold them. Reload and try again." }, 400);
  }
}
