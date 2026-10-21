import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfEnv } from "@/lib/audit/lookup";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { parseNewVersion } from "@/lib/secrets/payload";
import { addVersion, getEnvironmentKeys, listVersions } from "@/lib/secrets/store";
import { isUuid } from "@/lib/workspace/shared";

const noStore = { "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

type Ctx = { params: Promise<{ envId: string; secretId: string }> };

/** Every version of one secret, still sealed, oldest first. */
export async function GET(request: Request, { params }: Ctx) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const { envId, secretId } = await params;
  const versions = isUuid(envId) && isUuid(secretId) ? await listVersions(db, session.user.id, envId, secretId) : null;
  if (!versions) return json({ error: "Not found." }, 404);
  return json({ versions });
}

/**
 * Add a version on top of `baseVersion` (an edit, a restore or a delete). If the
 * secret moved on, nothing is written: the response is 409 with the newer
 * version so the editor can show the difference.
 */
export async function POST(request: Request, { params }: Ctx) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);

  const { envId, secretId } = await params;
  if (!isUuid(envId) || !isUuid(secretId) || !(await getEnvironmentKeys(db, session.user.id, envId))) {
    return json({ error: "Not found." }, 404);
  }

  const read = await readJsonLimited(request, 400_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.value;
  const parsed = parseNewVersion(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await addVersion(db, session.user.id, envId, secretId, parsed.value);
  switch (result.status) {
    case "created": {
      const orgId = await orgOfEnv(db, envId);
      if (orgId) await audit(db, { orgId, actorId: session.user.id, type: parsed.value.deleted ? "secret.deleted" : "secret.updated", envId, data: { secretId, version: result.version } });
      return json({ version: result.version }, 201);
    }
    case "not-found":
      return json({ error: "Not found." }, 404);
    case "forbidden":
      return json({ error: "Your role can read this environment but not change secrets." }, 403);
    case "stale-key":
      return json({ error: "This environment's key changed. Reload the page and try again." }, 409);
    case "conflict":
      return json({ error: "conflict", latest: result.latest }, 409);
  }
}
