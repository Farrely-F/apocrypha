import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfProject } from "@/lib/audit/lookup";
import { deleteProject, renameProject } from "@/lib/workspace/manage";
import { guard, manageResponse, readName } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const body = await readName(request);
  if (body instanceof Response) return body;
  const { projectId } = await params;
  const orgId = await orgOfProject(db, projectId);
  const r = await renameProject(db, who.userId, projectId, body.name);
  if (r.status === "ok" && orgId) await audit(db, { orgId, actorId: who.userId, type: "project.renamed", data: { projectId } });
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
