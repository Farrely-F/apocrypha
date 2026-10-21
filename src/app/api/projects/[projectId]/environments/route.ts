import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { getVaultRecord } from "@/lib/vault/store";
import { createEnvironment } from "@/lib/workspace/manage";
import { parseNewEnvironment } from "@/lib/workspace/payload";
import { isUuid } from "@/lib/workspace/shared";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Add an environment to a project. The key arrives wrapped to the caller only. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const { projectId } = await params;
  if (!isUuid(projectId)) return json({ error: "Not found." }, 404);
  const vault = await getVaultRecord(db, session.user.id);
  if (!vault) return json({ error: "Create your vault first." }, 409);

  const read = await readJsonLimited(request, 8_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const alg = vault.publicKey.split("|")[1] === "p256" ? "p256" : "x25519";
  const parsed = parseNewEnvironment(read.value, alg, "body");
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const r = await createEnvironment(db, session.user.id, projectId, parsed.value);
  switch (r.status) {
    case "created":
      await audit(db, { orgId: r.orgId, actorId: session.user.id, type: "env.created", envId: r.envId, data: { projectId: r.projectId } });
      return json({ orgId: r.orgId, projectId: r.projectId, envId: r.envId }, 201);
    case "not-found":
      return json({ error: "Not found." }, 404);
    case "forbidden":
      return json({ error: "Only owners and admins can create environments." }, 403);
    case "name-taken":
      return json({ error: "An environment with that name already exists in this project." }, 409);
    case "env-exists":
      return json({ error: "That environment already exists." }, 409);
  }
}
