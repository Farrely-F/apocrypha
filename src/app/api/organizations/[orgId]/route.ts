import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { readJsonLimited } from "@/lib/http/body";
import { UUID } from "@/lib/vault/payload";
import { deleteOrganization, renameOrganization } from "@/lib/workspace/manage";
import { guard, json, manageResponse, readName } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ orgId: string }> };

/** Rename the organisation. Owners only. */
export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const body = await readName(request);
  if (body instanceof Response) return body;
  const { orgId } = await params;
  if (!UUID.test(orgId)) return json({ error: "No such organisation." }, 404);
  const r = await renameOrganization(db, who.userId, orgId, body.name);
  if (r.status === "ok") await audit(db, { orgId, actorId: who.userId, type: "org.renamed" });
  if (r.status === "forbidden") return json({ error: "Only an owner can rename the organisation." }, 403);
  return manageResponse(r, "organisation");
}

/**
 * Delete the organisation and everything in it. Owners only, and the body must repeat the organisation's
 * name, so a stray request cannot do it.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const read = await readJsonLimited(request, 1_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const name = (read.value as { name?: unknown } | null)?.name;
  if (typeof name !== "string") return json({ error: "Send { name } with the organisation's exact name." }, 400);
  const { orgId } = await params;
  if (!UUID.test(orgId)) return json({ error: "No such organisation." }, 404);
  const r = await deleteOrganization(db, who.userId, orgId, name);
  if (r.status === "name-mismatch") return json({ error: "That is not the organisation's name." }, 400);
  if (r.status === "forbidden") return json({ error: "Only an owner can delete the organisation." }, 403);
  return manageResponse(r, "organisation");
}
