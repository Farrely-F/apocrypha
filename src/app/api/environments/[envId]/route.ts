import { db } from "@/lib/db/client";
import { deleteEnvironment, renameEnvironment } from "@/lib/workspace/manage";
import { guard, manageResponse, readName } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ envId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const body = await readName(request);
  if (body instanceof Response) return body;
  const { envId } = await params;
  return manageResponse(await renameEnvironment(db, who.userId, envId, body.name), "environment");
}

export async function DELETE(request: Request, { params }: Ctx) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const { envId } = await params;
  return manageResponse(await deleteEnvironment(db, who.userId, envId), "environment");
}
