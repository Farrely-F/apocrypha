import { and, desc, eq, gt, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import type { NewShare } from "./payload";
import { BUILDERS } from "../workspace/roles";

type Db = LibSQLDatabase<typeof schema>;

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export type CreateShareResult = { status: "created"; id: string; expiresAt: Date | null } | { status: "forbidden" | "not-found" | "exists" };

/**
 * Owners and admins who can open the environment may share a snapshot of it. Someone who
 * cannot open it has no plaintext to seal, and a stranger learns nothing (not-found).
 */
export async function createShare(db: Db, userId: string, envId: string, input: NewShare, now = new Date()): Promise<CreateShareResult> {
  const [env] = await db
    .select({ orgId: schema.project.organizationId })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .where(eq(schema.environment.id, envId))
    .limit(1);
  const role = env ? await roleIn(db, userId, env.orgId) : null;
  if (!env || !role) return { status: "not-found" };
  const [grant] = await db
    .select({ k: schema.environmentKeyGrant.keyVersion })
    .from(schema.environmentKeyGrant)
    .where(and(eq(schema.environmentKeyGrant.envId, envId), eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, userId)))
    .limit(1);
  if (!grant) return { status: "not-found" };
  if (!BUILDERS.includes(role)) return { status: "forbidden" };
  const [dup] = await db.select({ id: schema.share.id }).from(schema.share).where(eq(schema.share.id, input.id)).limit(1);
  if (dup) return { status: "exists" };

  const expiresAt = input.expiresInMinutes === null ? null : new Date(now.getTime() + input.expiresInMinutes * 60_000);
  await db.insert(schema.share).values({
    id: input.id,
    organizationId: env.orgId,
    envId,
    createdBy: userId,
    envelope: input.envelope,
    passwordProtected: input.passwordProtected,
    itemCount: input.itemCount,
    expiresAt,
    maxViews: input.maxViews,
  });
  return { status: "created", id: input.id, expiresAt };
}

export type ShareRow = {
  id: string;
  envId: string;
  envName: string;
  projectName: string;
  createdByName: string;
  passwordProtected: boolean;
  itemCount: number;
  expiresAt: Date | null;
  maxViews: number | null;
  views: number;
  lastViewedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/** Metadata only, for owners and admins. The envelope never leaves through here. */
export async function listShares(db: Db, userId: string, orgId: string): Promise<ShareRow[] | null> {
  const role = await roleIn(db, userId, orgId);
  if (!role || !BUILDERS.includes(role)) return null;
  return db
    .select({
      id: schema.share.id,
      envId: schema.share.envId,
      envName: schema.environment.name,
      projectName: schema.project.name,
      createdByName: schema.user.name,
      passwordProtected: schema.share.passwordProtected,
      itemCount: schema.share.itemCount,
      expiresAt: schema.share.expiresAt,
      maxViews: schema.share.maxViews,
      views: schema.share.views,
      lastViewedAt: schema.share.lastViewedAt,
      revokedAt: schema.share.revokedAt,
      createdAt: schema.share.createdAt,
    })
    .from(schema.share)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.share.envId))
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(schema.user, eq(schema.user.id, schema.share.createdBy))
    .where(eq(schema.share.organizationId, orgId))
    .orderBy(desc(schema.share.createdAt))
    .limit(100);
}

export async function revokeShare(db: Db, userId: string, shareId: string, now = new Date()): Promise<"ok" | "forbidden" | "not-found"> {
  const [s] = await db.select({ orgId: schema.share.organizationId }).from(schema.share).where(eq(schema.share.id, shareId)).limit(1);
  const role = s ? await roleIn(db, userId, s.orgId) : null;
  if (!s || !role) return "not-found";
  if (!BUILDERS.includes(role)) return "forbidden";
  await db.update(schema.share).set({ revokedAt: now }).where(and(eq(schema.share.id, shareId), isNull(schema.share.revokedAt)));
  return "ok";
}

export type Opened = { envelope: string; passwordProtected: boolean; views: number; maxViews: number | null; expiresAt: Date | null };

/**
 * A guest opens a link: spend one view and hand back the sealed envelope, or nothing. One atomic
 * statement checks revoked, expiry and the view limit and counts the view, so two guests racing
 * for the last view cannot both get it. Unknown, expired, revoked and used-up links look the same.
 */
export async function openShare(db: Db, shareId: string, now = new Date()): Promise<Opened | null> {
  const [row] = await db
    .update(schema.share)
    .set({ views: sql`${schema.share.views} + 1`, lastViewedAt: now })
    .where(
      and(
        eq(schema.share.id, shareId),
        isNull(schema.share.revokedAt),
        or(isNull(schema.share.expiresAt), gt(schema.share.expiresAt, now)),
        or(isNull(schema.share.maxViews), lt(schema.share.views, schema.share.maxViews)),
      ),
    )
    .returning({
      envelope: schema.share.envelope,
      passwordProtected: schema.share.passwordProtected,
      views: schema.share.views,
      maxViews: schema.share.maxViews,
      expiresAt: schema.share.expiresAt,
    });
  return row ?? null;
}

/**
 * Delete this environment's finished links (revoked, expired or out of views) so the list stays short.
 * Active links are never touched. The audit log keeps the history.
 */
export async function clearFinishedShares(db: Db, userId: string, orgId: string, envId: string, now = new Date()): Promise<{ status: "ok"; removed: number } | { status: "forbidden" | "not-found" }> {
  const role = await roleIn(db, userId, orgId);
  if (!role) return { status: "not-found" };
  if (!BUILDERS.includes(role)) return { status: "forbidden" };
  const gone = await db
    .delete(schema.share)
    .where(
      and(
        eq(schema.share.organizationId, orgId),
        eq(schema.share.envId, envId),
        or(
          isNotNull(schema.share.revokedAt),
          and(isNotNull(schema.share.expiresAt), lte(schema.share.expiresAt, now)),
          and(isNotNull(schema.share.maxViews), sql`${schema.share.views} >= ${schema.share.maxViews}`),
        ),
      ),
    )
    .returning({ id: schema.share.id });
  return { status: "ok", removed: gone.length };
}
