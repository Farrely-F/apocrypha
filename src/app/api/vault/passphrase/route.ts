import { auth } from "@/lib/auth/auth";
import { REAUTH_MESSAGE, signedInRecently } from "@/lib/auth/fresh";
import { db } from "@/lib/db/client";
import { auditAccount } from "@/lib/audit/lookup";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { checkPassphraseBlob, type Alg } from "@/lib/vault/payload";
import { getVaultRecord, replacePassphraseBlob } from "@/lib/vault/store";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Replace the passphrase blob (the keypair stays). Only succeeds from the blob the client last saw. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  // Replacing the blob can lock the owner out, so a session cookie alone is not enough.
  if (!signedInRecently(session.session)) return json({ error: REAUTH_MESSAGE, code: "reauth" }, 403);
  const vault = await getVaultRecord(db, session.user.id);
  if (!vault) return json({ error: "No vault for this account." }, 404);

  const read = await readJsonLimited(request, 16_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const o = read.value as Record<string, unknown> | null;
  if (typeof o !== "object" || o === null || Object.keys(o).some((k) => k !== "previousBlob" && k !== "passphraseBlob")) {
    return json({ error: "Send { previousBlob, passphraseBlob }." }, 400);
  }
  if (typeof o.previousBlob !== "string" || typeof o.passphraseBlob !== "string" || o.passphraseBlob.length > 4096) {
    return json({ error: "previousBlob and passphraseBlob must be strings." }, 400);
  }
  const bad = checkPassphraseBlob(o.passphraseBlob, vault.publicKey.split("|")[1] as Alg);
  if (bad) return json({ error: bad }, 400);

  const ok = await replacePassphraseBlob(db, session.user.id, o.previousBlob, o.passphraseBlob);
  if (ok) await auditAccount(db, session.user.id, "account.passphrase_changed");
  return ok ? json({ ok: true }, 200) : json({ error: "Your passphrase changed somewhere else. Reload and try again." }, 409);
}
