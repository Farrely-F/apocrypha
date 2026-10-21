import { and, asc, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import { insertPersonalWorkspace } from "./queries";
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

export type ManageResult = { status: "ok" } | { status: "forbidden" | "not-found" | "name-taken" | "last-environment" };

/** The org role of the caller over a project or environment, or null (which reads as not found). */
async function roleOver(db: Db, userId: string, target: { projectId: string } | { envId: string }) {
  const rows =
    "projectId" in target
      ? await db
          .select({ orgId: schema.project.organizationId, projectId: schema.project.id })
          .from(schema.project)
          .where(eq(schema.project.id, target.projectId))
          .limit(1)
      : await db
          .select({ orgId: schema.project.organizationId, projectId: schema.project.id })
          .from(schema.environment)
          .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
          .where(eq(schema.environment.id, target.envId))
          .limit(1);
  const found = rows[0];
  const role = found ? await roleIn(db, userId, found.orgId) : null;
  return found && role ? { ...found, role } : null;
}

export async function renameProject(db: Db, userId: string, projectId: string, name: string): Promise<ManageResult> {
  const t = await roleOver(db, userId, { projectId });
  if (!t) return { status: "not-found" };
  if (!BUILDERS.includes(t.role)) return { status: "forbidden" };
  const [dup] = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(and(eq(schema.project.organizationId, t.orgId), eq(schema.project.name, name)))
    .limit(1);
  if (dup && dup.id !== projectId) return { status: "name-taken" };
  await db.update(schema.project).set({ name }).where(eq(schema.project.id, projectId));
  return { status: "ok" };
}

/** Removes the project, its environments, keys and every secret version (cascade). */
export async function deleteProject(db: Db, userId: string, projectId: string): Promise<ManageResult> {
  const t = await roleOver(db, userId, { projectId });
  if (!t) return { status: "not-found" };
  if (!BUILDERS.includes(t.role)) return { status: "forbidden" };
  await db.delete(schema.project).where(eq(schema.project.id, projectId));
  return { status: "ok" };
}

export async function renameEnvironment(db: Db, userId: string, envId: string, name: string): Promise<ManageResult> {
  const t = await roleOver(db, userId, { envId });
  if (!t) return { status: "not-found" };
  if (!BUILDERS.includes(t.role)) return { status: "forbidden" };
  const [dup] = await db
    .select({ id: schema.environment.id })
    .from(schema.environment)
    .where(and(eq(schema.environment.projectId, t.projectId), eq(schema.environment.name, name)))
    .limit(1);
  if (dup && dup.id !== envId) return { status: "name-taken" };
  await db.update(schema.environment).set({ name }).where(eq(schema.environment.id, envId));
  return { status: "ok" };
}

/** A project keeps at least one environment; to remove the last one, delete the project. */
export async function deleteEnvironment(db: Db, userId: string, envId: string): Promise<ManageResult> {
  const t = await roleOver(db, userId, { envId });
  if (!t) return { status: "not-found" };
  if (!BUILDERS.includes(t.role)) return { status: "forbidden" };
  const siblings = await db.select({ id: schema.environment.id }).from(schema.environment).where(eq(schema.environment.projectId, t.projectId)).limit(2);
  if (siblings.length < 2) return { status: "last-environment" };
  await db.delete(schema.environment).where(eq(schema.environment.id, envId));
  return { status: "ok" };
}

/** A new organisation with the caller as owner, plus its first project and environment. */
export async function createOrganization(
  db: Db,
  userId: string,
  input: { name: string; projectName: string; environment: NewEnvironment },
): Promise<{ status: "created"; orgId: string; projectId: string; envId: string } | { status: "env-exists" }> {
  const [clash] = await db.select({ id: schema.environment.id }).from(schema.environment).where(eq(schema.environment.id, input.environment.id)).limit(1);
  if (clash) return { status: "env-exists" };
  const ids = await db.transaction((tx) =>
    insertPersonalWorkspace(
      tx,
      userId,
      {
        envId: input.environment.id,
        wrappedKey: input.environment.wrappedKey,
        orgName: input.name,
        projectName: input.projectName,
        environmentName: input.environment.name,
      },
      "org",
    ),
  );
  return { status: "created", ...ids };
}
