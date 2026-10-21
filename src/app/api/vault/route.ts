import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { parseVaultPayload } from "@/lib/vault/payload";
import { createVaultRecord } from "@/lib/vault/store";

const json = (body: unknown, status: number) => Response.json(body, { status });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  return allowed.has(origin);
}

/** Create the signed-in user's vault. Only public key material and wrapped blobs arrive here. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const parsed = parseVaultPayload(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await createVaultRecord(db, session.user.id, parsed.value);
  if (result === "exists") {
    return json({ error: "A vault already exists for this account." }, 409);
  }
  return json({ ok: true }, 201);
}
