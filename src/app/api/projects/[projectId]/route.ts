import { db } from "@/lib/db/client";
import { deleteProject, renameProject } from "@/lib/workspace/manage";
import { guard, manageResponse, readName } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const body = await readName(request);
  if (body instanceof Response) return body;
  const { projectId } = await params;
  return manageResponse(await renameProject(db, who.userId, projectId, body.name), "project");
}

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { projectId } = await params;
  return manageResponse(await deleteProject(db, who.userId, projectId), "project");
}
