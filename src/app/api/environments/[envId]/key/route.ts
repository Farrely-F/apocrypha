import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { getEnvironmentKeys } from "@/lib/secrets/store";
import { isUuid } from "@/lib/workspace/shared";

const noStore = { "cache-control": "private, no-store" };

/**
 * The caller's own wrapped copies of an environment's key. Only the person the
 * key is wrapped to can open them; everyone else gets the same 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ envId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  const { envId } = await params;
  const keys = isUuid(envId) ? await getEnvironmentKeys(db, session.user.id, envId) : null;
  if (!keys) return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  return Response.json(
    { currentKeyVersion: keys.currentKeyVersion, grants: keys.grants },
    { headers: noStore },
  );
}
