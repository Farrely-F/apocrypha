import { and, asc, eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import type { CreateSecretBody, NewVersionBody } from "./payload";
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
        eq(schema.secretVersion.deleted, false),
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

export type CreateSecretsResult =
  | { status: "created"; ids: string[] }
  | { status: "forbidden" | "stale-key" | "exists" };

/** Thrown inside a transaction to abort it when an id is already taken. */
class DuplicateSecret extends Error {}

/** Create many secrets at once (an import): all of them, or none. */
export async function createSecrets(
  db: Db,
  userId: string,
  envId: string,
  bodies: CreateSecretBody[],
): Promise<CreateSecretsResult> {
  const access = await getEnvironmentKeys(db, userId, envId);
  if (!access || !WRITERS.includes(access.role)) return { status: "forbidden" };
  for (const b of bodies) {
    if (b.keyVersion !== access.currentKeyVersion || !access.grants.some((g) => g.keyVersion === b.keyVersion)) {
      return { status: "stale-key" };
    }
  }
  return db.transaction(async (tx) => {
    for (const b of bodies) {
      const inserted = await tx
        .insert(schema.secret)
        .values({ id: b.secretId, environmentId: envId, createdBy: userId })
        .onConflictDoNothing()
        .returning({ id: schema.secret.id });
      if (inserted.length === 0) throw new DuplicateSecret();
      await tx.insert(schema.secretVersion).values({
        secretId: b.secretId,
        version: 1,
        keyVersion: b.keyVersion,
        name: b.name,
        value: b.value,
        metadata: b.metadata,
        createdBy: userId,
      });
    }
    return { status: "created", ids: bodies.map((b) => b.secretId) } as const;
  }).catch((e: unknown) => {
    if (e instanceof DuplicateSecret) return { status: "exists" } as const;
    throw e;
  });
}

/** One stored version of a secret, with who wrote it. All fields still sealed. */
export type HistoryRow = {
  version: number;
  keyVersion: number;
  name: string;
  value: string;
  metadata: string | null;
  deleted: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: number;
};

async function readHistory(db: Db, secretId: string): Promise<HistoryRow[]> {
  const rows = await db
    .select({
      version: schema.secretVersion.version,
      keyVersion: schema.secretVersion.keyVersion,
      name: schema.secretVersion.name,
      value: schema.secretVersion.value,
      metadata: schema.secretVersion.metadata,
      deleted: schema.secretVersion.deleted,
      createdBy: schema.secretVersion.createdBy,
      createdByName: schema.user.name,
      createdAt: schema.secretVersion.createdAt,
    })
    .from(schema.secretVersion)
    .leftJoin(schema.user, eq(schema.user.id, schema.secretVersion.createdBy))
    .where(eq(schema.secretVersion.secretId, secretId))
    .orderBy(asc(schema.secretVersion.version));
  return rows.map((r) => ({ ...r, createdByName: r.createdByName ?? "Unknown", createdAt: r.createdAt.getTime() }));
}

async function secretInEnvironment(db: Db, envId: string, secretId: string) {
  const [row] = await db
    .select({ id: schema.secret.id })
    .from(schema.secret)
    .where(and(eq(schema.secret.id, secretId), eq(schema.secret.environmentId, envId)))
    .limit(1);
  return row !== undefined;
}

/** Every version of one secret, oldest first, or null without access or no such secret. */
export async function listVersions(
  db: Db,
  userId: string,
  envId: string,
  secretId: string,
): Promise<HistoryRow[] | null> {
  if (!(await getEnvironmentKeys(db, userId, envId))) return null;
  if (!(await secretInEnvironment(db, envId, secretId))) return null;
  return readHistory(db, secretId);
}

export type AddVersionResult =
  | { status: "created"; version: number }
  | { status: "forbidden" | "stale-key" | "not-found" }
  | { status: "conflict"; latest: HistoryRow };

/**
 * Append a version on top of `baseVersion`. If someone else got there first
 * (or the secret was deleted) nothing is written and the newer version comes
 * back, so the editor can show what changed instead of overwriting it.
 */
export async function addVersion(
  db: Db,
  userId: string,
  envId: string,
  secretId: string,
  body: NewVersionBody,
): Promise<AddVersionResult> {
  const access = await getEnvironmentKeys(db, userId, envId);
  if (!access || !WRITERS.includes(access.role)) return { status: "forbidden" };
  if (body.keyVersion !== access.currentKeyVersion || !access.grants.some((g) => g.keyVersion === body.keyVersion)) {
    return { status: "stale-key" };
  }
  if (!(await secretInEnvironment(db, envId, secretId))) return { status: "not-found" };

  const conflict = async (): Promise<AddVersionResult> => {
    const all = await readHistory(db, secretId);
    return { status: "conflict", latest: all[all.length - 1] };
  };

  const history = await readHistory(db, secretId);
  const latest = history[history.length - 1];
  if (latest.version !== body.baseVersion || latest.deleted) return conflict();

  try {
    await db.insert(schema.secretVersion).values({
      secretId,
      version: body.baseVersion + 1,
      keyVersion: body.keyVersion,
      name: body.name,
      value: body.value,
      metadata: body.metadata,
      deleted: body.deleted,
      createdBy: userId,
    });
  } catch {
    // The primary key (secret, version) means a racing writer already took this slot.
    return conflict();
  }
  return { status: "created", version: body.baseVersion + 1 };
}
