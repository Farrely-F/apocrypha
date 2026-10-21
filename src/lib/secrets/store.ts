import { and, asc, eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import type { CreateSecretBody } from "./payload";
import type { SecretRow } from "./seal";

type Db = LibSQLDatabase<typeof schema>;

export type EnvironmentKeys = {
  role: OrgRole;
  currentKeyVersion: number;
  /** The caller's own wrapped copies of the environment key, oldest first. */
  grants: { keyVersion: number; wrappedKey: string }[];
};

/**
 * The caller's access to one environment, or null. Needs org membership AND at
 * least one grant on the environment; null never says which was missing.
 */
export async function getEnvironmentKeys(
  db: Db,
  userId: string,
  envId: string,
): Promise<EnvironmentKeys | null> {
  const [row] = await db
    .select({ role: schema.member.role, currentKeyVersion: schema.environment.currentKeyVersion })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(
      schema.member,
      and(eq(schema.member.organizationId, schema.project.organizationId), eq(schema.member.userId, userId)),
    )
    .where(eq(schema.environment.id, envId))
    .limit(1);
  if (!row) return null;

  const grants = await db
    .select({ keyVersion: schema.environmentKeyGrant.keyVersion, wrappedKey: schema.environmentKeyGrant.wrappedKey })
    .from(schema.environmentKeyGrant)
    .where(
      and(
        eq(schema.environmentKeyGrant.envId, envId),
        eq(schema.environmentKeyGrant.principalType, "user"),
        eq(schema.environmentKeyGrant.principalId, userId),
      ),
    )
    .orderBy(asc(schema.environmentKeyGrant.keyVersion));
  if (grants.length === 0) return null;
  return { ...row, grants };
}

/** Latest version of every secret in the environment, or null without access. */
export async function listSecrets(db: Db, userId: string, envId: string): Promise<SecretRow[] | null> {
  if (!(await getEnvironmentKeys(db, userId, envId))) return null;
  const rows = await db
    .select({
      id: schema.secret.id,
      version: schema.secretVersion.version,
      keyVersion: schema.secretVersion.keyVersion,
      name: schema.secretVersion.name,
      value: schema.secretVersion.value,
      metadata: schema.secretVersion.metadata,
      createdAt: schema.secret.createdAt,
    })
    .from(schema.secret)
    .innerJoin(schema.secretVersion, eq(schema.secretVersion.secretId, schema.secret.id))
    .where(
      and(
        eq(schema.secret.environmentId, envId),
        eq(
          schema.secretVersion.version,
          sql`(select max(v.version) from secret_version v where v.secret_id = ${schema.secret.id})`,
        ),
      ),
    )
    .orderBy(asc(schema.secret.createdAt), asc(schema.secret.id));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }));
}

export type CreateSecretResult =
  | { status: "created"; id: string; version: 1 }
  | { status: "forbidden" | "stale-key" | "exists" };

/** Only these roles may write; everyone else with a grant can read. */
const WRITERS: readonly OrgRole[] = ["owner", "admin"];

/**
 * Store a new secret as version 1. The secret row and its first version go in
 * together or not at all.
 */
export async function createSecret(
  db: Db,
  userId: string,
  envId: string,
  body: CreateSecretBody,
): Promise<CreateSecretResult> {
  const access = await getEnvironmentKeys(db, userId, envId);
  if (!access || !WRITERS.includes(access.role)) return { status: "forbidden" };
  if (body.keyVersion !== access.currentKeyVersion || !access.grants.some((g) => g.keyVersion === body.keyVersion)) {
    return { status: "stale-key" };
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.secret)
      .values({ id: body.secretId, environmentId: envId, createdBy: userId })
      .onConflictDoNothing()
      .returning({ id: schema.secret.id });
    if (inserted.length === 0) return { status: "exists" } as const;
    await tx.insert(schema.secretVersion).values({
      secretId: body.secretId,
      version: 1,
      keyVersion: body.keyVersion,
      name: body.name,
      value: body.value,
      metadata: body.metadata,
      createdBy: userId,
    });
    return { status: "created", id: body.secretId, version: 1 } as const;
  });
}
