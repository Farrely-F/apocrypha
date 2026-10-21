import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
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
  if (!isUuid(envId) || !(await getEnvironmentKeys(db, session.user.id, envId))) {
    return json({ error: "Not found." }, 404);
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "That import is too large. Split it up." }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }
  const parsed = parseBatch(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await createSecrets(db, session.user.id, envId, parsed.value);
  switch (result.status) {
    case "created":
      return json({ ids: result.ids }, 201);
    case "forbidden":
      return json({ error: "Your role can read this environment but not add secrets." }, 403);
    case "stale-key":
      return json({ error: "This environment's key changed. Reload the page and try again." }, 409);
    case "exists":
      return json({ error: "One of those secrets already exists." }, 409);
  }
}
