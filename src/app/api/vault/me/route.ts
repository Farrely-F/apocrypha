import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { getVaultRecord } from "@/lib/vault/store";

// Private, per-user, never cached by the browser or an intermediary.
const noStore = { "cache-control": "private, no-store" };
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: noStore });

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  return allowed.has(origin);
}

/**
 * The signed-in user's public key and passphrase-wrapped private key, so the
 * browser can unlock. The recovery blob is deliberately not served here: it
 * has its own, later flow.
 */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);

  const vault = await getVaultRecord(db, session.user.id);
  if (!vault) return json({ error: "No vault for this account." }, 404);

  return json({ publicKey: vault.publicKey, passphraseBlob: vault.passphraseBlob }, 200);
}
