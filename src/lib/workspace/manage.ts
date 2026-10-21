import { and, asc, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import { FIRST_KEY_VERSION } from "./shared";

type Db = LibSQLDatabase<typeof schema>;

export type TreeEnvironment = { id: string; name: string };
export type TreeProject = { id: string; name: string; environments: TreeEnvironment[] };
export type TreeOrg = { id: string; name: string; role: OrgRole; projects: TreeProject[] };

/**
 * Everything the signed-in user can open: their orgs, each org's projects, and
 * only the environments they hold a key grant for (anything else could not be
 * decrypted). Oldest first, so the order is stable.
 */
export async function listWorkspaceTree(db: Db, userId: string): Promise<TreeOrg[]> {
  const orgs = await db
    .select({ id: schema.organization.id, name: schema.organization.name, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.member.createdAt), asc(schema.organization.id));
  if (orgs.length === 0) return [];

  const projects = await db
    .select({ id: schema.project.id, orgId: schema.project.organizationId, name: schema.project.name })
    .from(schema.project)
    .where(inArray(schema.project.organizationId, orgs.map((o) => o.id)))
    .orderBy(asc(schema.project.createdAt), asc(schema.project.id));

  const envs = projects.length
    ? await db
        .select({ id: schema.environment.id, projectId: schema.environment.projectId, name: schema.environment.name })
        .from(schema.environment)
        .innerJoin(
          schema.environmentKeyGrant,
          and(
            eq(schema.environmentKeyGrant.envId, schema.environment.id),
            eq(schema.environmentKeyGrant.principalType, "user"),
            eq(schema.environmentKeyGrant.principalId, userId),
          ),
        )
        .where(inArray(schema.environment.projectId, projects.map((p) => p.id)))
        .orderBy(asc(schema.environment.createdAt), asc(schema.environment.id))
    : [];

  return orgs.map((o) => ({
    ...o,
    projects: projects
      .filter((p) => p.orgId === o.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        environments: envs.filter((e) => e.projectId === p.id).map((e) => ({ id: e.id, name: e.name })),
      }))
      // A project with no environment you can open is not something you can use.
      .filter((p) => p.environments.length > 0),
  }));
}

/** Only these roles may create projects and environments. */
const BUILDERS: readonly OrgRole[] = ["owner", "admin"];

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export type NewEnvironment = { id: string; name: string; wrappedKey: string };

export type CreateProjectResult =
  | { status: "created"; orgId: string; projectId: string; envId: string }
  | { status: "forbidden" | "name-taken" | "env-exists" };

/** A project always starts with one environment, so there is somewhere to put secrets. */
export async function createProject(
  db: Db,
  userId: string,
  input: { orgId: string; name: string; environment: NewEnvironment },
): Promise<CreateProjectResult> {
  const role = await roleIn(db, userId, input.orgId);
  if (!role || !BUILDERS.includes(role)) return { status: "forbidden" };

  const [dup] = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(and(eq(schema.project.organizationId, input.orgId), eq(schema.project.name, input.name)))
    .limit(1);
  if (dup) return { status: "name-taken" };
  const [clash] = await db.select({ id: schema.environment.id }).from(schema.environment).where(eq(schema.environment.id, input.environment.id)).limit(1);
  if (clash) return { status: "env-exists" };

  const projectId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.project).values({ id: projectId, organizationId: input.orgId, name: input.name });
    await insertEnvironment(tx, userId, projectId, input.environment);
  });
  return { status: "created", orgId: input.orgId, projectId, envId: input.environment.id };
}

export type CreateEnvironmentResult =
  | { status: "created"; orgId: string; projectId: string; envId: string }
  | { status: "forbidden" | "not-found" | "name-taken" | "env-exists" };

export async function createEnvironment(
  db: Db,
  userId: string,
  projectId: string,
  input: NewEnvironment,
): Promise<CreateEnvironmentResult> {
  const [project] = await db
    .select({ orgId: schema.project.organizationId })
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
    .limit(1);
  const role = project ? await roleIn(db, userId, project.orgId) : null;
  // A project in an org you are not in does not exist as far as you can tell.
  if (!project || !role) return { status: "not-found" };
  if (!BUILDERS.includes(role)) return { status: "forbidden" };

  const [dup] = await db
    .select({ id: schema.environment.id })
    .from(schema.environment)
    .where(and(eq(schema.environment.projectId, projectId), eq(schema.environment.name, input.name)))
    .limit(1);
  if (dup) return { status: "name-taken" };
  const [clash] = await db.select({ id: schema.environment.id }).from(schema.environment).where(eq(schema.environment.id, input.id)).limit(1);
  if (clash) return { status: "env-exists" };

  await db.transaction(async (tx) => insertEnvironment(tx, userId, projectId, input));
  return { status: "created", orgId: project.orgId, projectId, envId: input.id };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The environment and the creator's grant. The wrapped key is stored as received. */
async function insertEnvironment(tx: Tx, userId: string, projectId: string, env: NewEnvironment) {
  await tx.insert(schema.environment).values({ id: env.id, projectId, name: env.name, currentKeyVersion: FIRST_KEY_VERSION });
  await tx.insert(schema.environmentKeyGrant).values({
    envId: env.id,
    principalType: "user",
    principalId: userId,
    keyVersion: FIRST_KEY_VERSION,
    wrappedKey: env.wrappedKey,
  });
}
