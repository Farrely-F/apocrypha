import { auth } from "@/lib/auth/auth";
import { REAUTH_MESSAGE, signedInRecently } from "@/lib/auth/fresh";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { auditAccount } from "@/lib/audit/lookup";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { parseVaultPayload } from "@/lib/vault/payload";
import { previewReset, resetVault } from "@/lib/vault/reset";
import { getVaultRecord } from "@/lib/vault/store";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** What a reset would cost: which environments could be shared again by an admin, and which are lost for good. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  if (!(await getVaultRecord(db, session.user.id))) return json({ error: "No vault for this account." }, 404);
  return json(await previewReset(db, session.user.id), 200);
}

/**
 * Replace the key pair after losing both the passphrase and the recovery key. Destructive, so it
 * needs a recent sign-in, not just a session cookie.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  if (!signedInRecently(session.session)) return json({ error: REAUTH_MESSAGE.replace("Changing the passphrase needs", "Resetting needs"), code: "reauth" }, 403);

  const read = await readJsonLimited(request, 64_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const parsed = parseVaultPayload(read.value);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await resetVault(db, session.user.id, parsed.value);
  if (result.status !== "reset") {
    return result.status === "no-vault" ? json({ error: "No vault for this account." }, 404) : json({ error: "That environment already exists. Try again." }, 409);
  }
  await auditAccount(db, session.user.id, "member.vault_reset", { lost: result.impact.lost.length, recoverable: result.impact.recoverable.length });
  const { orgId, projectId, envId, impact } = result;
  return json({ ok: true, orgId, projectId, envId, lost: impact.lost.length, recoverable: impact.recoverable.length }, 200);
}
