import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { readJsonLimited } from "@/lib/http/body";
import { getVaultRecord } from "@/lib/vault/store";
import { createOrganization } from "@/lib/workspace/manage";
import { parseNewOrganization } from "@/lib/workspace/payload";
import { guard, json } from "@/lib/workspace/http";

/** Create an organisation (the caller becomes its owner) with a first project and environment. */
export async function POST(request: Request) {
  const who = await guard(request);
  if (who instanceof Response) return who;
  const vault = await getVaultRecord(db, who.userId);
  if (!vault) return json({ error: "Create your vault first." }, 409);

  const read = await readJsonLimited(request, 16_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const alg = vault.publicKey.split("|")[1] === "p256" ? "p256" : "x25519";
  const parsed = parseNewOrganization(read.value, alg);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const r = await createOrganization(db, who.userId, parsed.value);
  if (r.status === "env-exists") return json({ error: "That environment already exists." }, 409);
  await audit(db, { orgId: r.orgId, actorId: who.userId, type: "org.created", envId: r.envId, data: { projectId: r.projectId } });
  return json({ orgId: r.orgId, projectId: r.projectId, envId: r.envId }, 201);
}
