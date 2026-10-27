import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfEnv } from "@/lib/audit/lookup";
import { deleteEnvironment, updateEnvironment } from "@/lib/workspace/manage";
import { guard, manageResponse, readEnvironmentPatch } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ envId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const patch = await readEnvironmentPatch(request);
  if (patch instanceof Response) return patch;
  const { envId } = await params;
  const orgId = await orgOfEnv(db, envId);
  const r = await updateEnvironment(db, who.userId, envId, patch);
  if (r.status === "ok" && orgId) {
    await audit(db, { orgId, actorId: who.userId, type: "name" in patch ? "env.renamed" : "env.updated", envId, data: { fields: Object.keys(patch).join(",") } });
  }
  return manageResponse(r, "environment");
}

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { envId } = await params;
  const orgId = await orgOfEnv(db, envId);
  const r = await deleteEnvironment(db, who.userId, envId);
  // the environment row is gone, so the event carries its id in data, not as a reference
  if (r.status === "ok" && orgId) await audit(db, { orgId, actorId: who.userId, type: "env.deleted", data: { envId } });
  return manageResponse(r, "environment");
}
