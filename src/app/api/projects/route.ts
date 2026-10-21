import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit/store";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { getVaultRecord } from "@/lib/vault/store";
import { createProject } from "@/lib/workspace/manage";
import { parseNewProject } from "@/lib/workspace/payload";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Create a project and its first environment. The environment key arrives wrapped to the caller. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  const vault = await getVaultRecord(db, session.user.id);
  if (!vault) return json({ error: "Create your vault first." }, 409);

  const read = await readJsonLimited(request, 16_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const alg = vault.publicKey.split("|")[1] === "p256" ? "p256" : "x25519";
  const parsed = parseNewProject(read.value, alg);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const r = await createProject(db, session.user.id, parsed.value);
  switch (r.status) {
    case "created":
      await audit(db, { orgId: r.orgId, actorId: session.user.id, type: "project.created", envId: r.envId, data: { projectId: r.projectId } });
      return json({ orgId: r.orgId, projectId: r.projectId, envId: r.envId }, 201);
    case "forbidden":
      return json({ error: "Only owners and admins can create projects." }, 403);
    case "name-taken":
      return json({ error: "A project with that name already exists." }, 409);
    case "env-exists":
      return json({ error: "That environment already exists." }, 409);
  }
}
