import { auth } from "@/lib/auth/auth";
import { audit } from "@/lib/audit/store";
import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { limitWrites } from "@/lib/http/ratelimit";
import { parseVaultPayload } from "@/lib/vault/payload";
import { createVaultRecord } from "@/lib/vault/store";

const json = (body: unknown, status: number) => Response.json(body, { status });

/** Create the signed-in user's vault. Only public key material and wrapped blobs arrive here (vault blobs and the first environment grant); the server creates the personal workspace in the same transaction. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const slow = await limitWrites(db, session.user.id);
  if (slow) return slow;

  const read = await readJsonLimited(request, 64_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.value;

  const parsed = parseVaultPayload(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  let result;
  try {
    result = await createVaultRecord(db, session.user.id, parsed.value);
  } catch (error) {
    // The transaction rolled back: nothing was created. Log only the error code:
    // drizzle messages embed the query parameters (our blobs).
    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
    console.error("create vault failed:", cause?.code ?? "unknown error");
    return json({ error: "The server could not save your vault. Try again." }, 500);
  }
  if (result.status === "exists") {
    return json({ error: "A vault already exists for this account." }, 409);
  }
  const { orgId, projectId, envId } = result;
  await audit(db, { orgId, actorId: session.user.id, type: "org.created", envId, data: { projectId, personal: true } });
  return json({ ok: true, orgId, projectId, envId }, 201);
}
