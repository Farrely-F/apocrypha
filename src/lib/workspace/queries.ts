import { and, asc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { WorkspacePayload } from "../vault/payload";
import { inferKind, type EnvKind, type ProjectDetails, readTags } from "./meta";
import { FIRST_KEY_VERSION, type WorkspaceIds } from "./shared";

export { environmentPath, FIRST_KEY_VERSION, type WorkspaceIds } from "./shared";

type Db = LibSQLDatabase<typeof schema>;
/** A database or an open transaction. */
type Executor = Pick<Db, "insert" | "select">;

/**
 * Insert a personal org (the user as its owner), one project, one environment
 * and the user's grant on it. Call inside the transaction that creates the
 * vault so the whole workspace exists or none of it does. The wrapped key is
 * stored as received: the server never holds an environment key.
 */
export async function insertPersonalWorkspace(
  tx: Executor,
  userId: string,
  ws: WorkspacePayload,
  slugPrefix = "personal",
): Promise<WorkspaceIds> {
  const orgId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const { envId } = ws;

  await tx.insert(schema.organization).values({
    id: orgId,
    name: ws.orgName,
    // Better Auth's organization plugin requires a unique slug.
    // Full id: a short prefix could collide and roll the whole vault creation back.
    slug: `${slugPrefix}-${orgId}`,
  });
  await tx
    .insert(schema.member)
    .values({ id: crypto.randomUUID(), organizationId: orgId, userId, role: "owner" });
  await tx.insert(schema.project).values({ id: projectId, organizationId: orgId, name: ws.projectName });
  await tx.insert(schema.environment).values({
    id: envId,
    projectId,
    name: ws.environmentName,
    kind: ws.environmentKind ?? inferKind(ws.environmentName),
    currentKeyVersion: FIRST_KEY_VERSION,
  });
  await tx.insert(schema.environmentKeyGrant).values({
    envId,
    principalType: "user",
    principalId: userId,
    keyVersion: FIRST_KEY_VERSION,
    wrappedKey: ws.wrappedKey,
  });
  return { orgId, projectId, envId };
}

export type EnvironmentView = WorkspaceIds & {
  orgName: string;
  role: schema.OrgRole;
  /** Owners and admins always; a plain member only with a write grant on this environment. */
  canWrite: boolean;
  projectName: string;
  environmentName: string;
  environmentKind: EnvKind;
  project: ProjectDetails;
  currentKeyVersion: number;
};

/**
 * One environment as the user sees it, or null. Access needs BOTH org
 * membership and a grant on the environment, and the ids in the URL must form
 * a real org > project > environment chain. Null never says which check failed.
 */
export async function getEnvironmentForUser(
  db: Db,
  userId: string,
  ids: WorkspaceIds,
): Promise<EnvironmentView | null> {
  const [row] = await db
    .select({
      orgName: schema.organization.name,
      role: schema.member.role,
      projectName: schema.project.name,
      environmentName: schema.environment.name,
      environmentKind: schema.environment.kind,
      description: schema.project.description,
      tags: schema.project.tags,
      repoUrl: schema.project.repoUrl,
      docsUrl: schema.project.docsUrl,
      currentKeyVersion: schema.environment.currentKeyVersion,
    })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.project.organizationId))
    .innerJoin(
      schema.member,
      and(eq(schema.member.organizationId, schema.organization.id), eq(schema.member.userId, userId)),
    )
    .innerJoin(
      schema.environmentKeyGrant,
      and(
        eq(schema.environmentKeyGrant.envId, schema.environment.id),
        eq(schema.environmentKeyGrant.principalType, "user"),
        eq(schema.environmentKeyGrant.principalId, userId),
      ),
    )
    .where(
      and(
        eq(schema.environment.id, ids.envId),
        eq(schema.project.id, ids.projectId),
        eq(schema.organization.id, ids.orgId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [flag] = await db
    .select({ envId: schema.environmentWrite.envId })
    .from(schema.environmentWrite)
    .where(and(eq(schema.environmentWrite.envId, ids.envId), eq(schema.environmentWrite.userId, userId)))
    .limit(1);
  const { description, tags, repoUrl, docsUrl, ...rest } = row;
  return {
    ...ids,
    ...rest,
    project: { description, tags: readTags(tags), repoUrl, docsUrl },
    canWrite: row.role === "owner" || row.role === "admin" || !!flag,
  };
}

/**
 * Where to send a signed-in user: their first environment (oldest org, project
 * and environment) that they are a member of and hold a grant for, else null.
 */
export async function getDefaultEnvironmentForUser(
  db: Db,
  userId: string,
): Promise<WorkspaceIds | null> {
  const [row] = await db
    .select({
      orgId: schema.organization.id,
      projectId: schema.project.id,
      envId: schema.environment.id,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(schema.project, eq(schema.project.organizationId, schema.organization.id))
    .innerJoin(schema.environment, eq(schema.environment.projectId, schema.project.id))
    .innerJoin(
      schema.environmentKeyGrant,
      and(
        eq(schema.environmentKeyGrant.envId, schema.environment.id),
        eq(schema.environmentKeyGrant.principalType, "user"),
        eq(schema.environmentKeyGrant.principalId, userId),
      ),
    )
    .where(eq(schema.member.userId, userId))
    .orderBy(
      asc(schema.member.createdAt),
      asc(schema.project.createdAt),
      asc(schema.environment.createdAt),
      asc(schema.environment.id),
    )
    .limit(1);
  return row ?? null;
}
