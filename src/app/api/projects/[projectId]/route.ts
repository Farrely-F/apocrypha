import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfProject } from "@/lib/audit/lookup";
import { deleteProject, updateProject } from "@/lib/workspace/manage";
import { guard, manageResponse, readProjectPatch } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const patch = await readProjectPatch(request);
  if (patch instanceof Response) return patch;
  const { projectId } = await params;
  const orgId = await orgOfProject(db, projectId);
  const r = await updateProject(db, who.userId, projectId, patch);
  // ids and field names only, never the text itself
  if (r.status === "ok" && orgId) {
    const type = "name" in patch ? "project.renamed" : "project.updated";
    await audit(db, { orgId, actorId: who.userId, type, data: { projectId, fields: Object.keys(patch).join(",") } });
  }
  return manageResponse(r, "project");
}

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { projectId } = await params;
  const orgId = await orgOfProject(db, projectId);
  const r = await deleteProject(db, who.userId, projectId);
  if (r.status === "ok" && orgId) await audit(db, { orgId, actorId: who.userId, type: "project.deleted", data: { projectId } });
  return manageResponse(r, "project");
}
