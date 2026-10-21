import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { sameOrigin } from "@/lib/http/origin";
import { getVaultRecord } from "@/lib/vault/store";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** The recovery blob, for the signed-in user only. It opens only with the recovery key, which the server never has. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const vault = await getVaultRecord(db, session.user.id);
  if (!vault) return json({ error: "No vault for this account." }, 404);
  return json({ recoveryBlob: vault.recoveryBlob }, 200);
}
