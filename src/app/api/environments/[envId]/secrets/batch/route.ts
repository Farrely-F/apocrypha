import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { orgOfEnv, orgOfProject } from "@/lib/audit/lookup";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { parseBatch } from "@/lib/secrets/payload";
import { createSecrets, getEnvironmentKeys } from "@/lib/secrets/store";
import { isUuid } from "@/lib/workspace/shared";

const noStore = { "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

/** Many bytes of sealed secrets at once (an import). Refuse anything unreasonable early. */
const MAX_BODY_BYTES = 12_000_000;

/** Create several secrets in one go: all of them or none. Ciphertext only. */
export async function POST(request: Request, { params }: { params: Promise<{ envId: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);

  const { envId } = await params;
  const access = isUuid(envId) ? await getEnvironmentKeys(db, session.user.id, envId) : null;
  if (!access) return json({ error: "Not found." }, 404);
  // Decide who may write before reading a potentially large body.
  if (access.role !== "owner" && access.role !== "admin") {
    return json({ error: "Your role can read this environment but not add secrets." }, 403);
  }

  const read = await readJsonLimited(request, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const parsed = parseBatch(read.value);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await createSecrets(db, session.user.id, envId, parsed.value);
  switch (result.status) {
    case "created": {
      const orgId = await orgOfEnv(db, envId);
      if (orgId) for (const secretId of result.ids) await audit(db, { orgId, actorId: session.user.id, type: "secret.created", envId, data: { secretId } });
      return json({ ids: result.ids }, 201);
    }
    case "forbidden":
      return json({ error: "Your role can read this environment but not add secrets." }, 403);
    case "stale-key":
      return json({ error: "This environment's key changed. Reload the page and try again." }, 409);
    case "exists":
      return json({ error: "One of those secrets already exists." }, 409);
  }
}
