import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { parseCreateSecret } from "@/lib/secrets/payload";
import { createSecret, getEnvironmentKeys, listSecrets } from "@/lib/secrets/store";
import { isUuid } from "@/lib/workspace/shared";

const noStore = { "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

type Ctx = { params: Promise<{ envId: string }> };

/** Every secret in the environment, still sealed. The browser opens them. */
export async function GET(request: Request, { params }: Ctx) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const { envId } = await params;
  const secrets = isUuid(envId) ? await listSecrets(db, session.user.id, envId) : null;
  if (!secrets) return json({ error: "Not found." }, 404);
  return json({ secrets });
}

/** Add a secret. The body is ciphertext only; anything else is refused. */
export async function POST(request: Request, { params }: Ctx) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);

  const { envId } = await params;
  if (!isUuid(envId) || !(await getEnvironmentKeys(db, session.user.id, envId))) {
    return json({ error: "Not found." }, 404);
  }

  const read = await readJsonLimited(request, 400_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.value;
  const parsed = parseCreateSecret(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await createSecret(db, session.user.id, envId, parsed.value);
  switch (result.status) {
    case "created":
      return json({ id: result.id, version: result.version }, 201);
    case "forbidden":
      return json({ error: "Your role can read this environment but not add secrets." }, 403);
    case "stale-key":
      return json({ error: "This environment's key changed. Reload the page and try again." }, 409);
    case "exists":
      return json({ error: "That secret already exists." }, 409);
  }
}
