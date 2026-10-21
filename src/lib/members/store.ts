import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import { checkWrappedKey } from "../vault/payload";

type Db = LibSQLDatabase<typeof schema>;

export type MemberRow = { userId: string; name: string; email: string; role: OrgRole; publicKey: string | null; joinedAt: Date };

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

/** Everyone in the org. Visible to members only; a stranger gets null (reads as 404). */
export async function listMembers(db: Db, userId: string, orgId: string): Promise<MemberRow[] | null> {
  if (!(await roleIn(db, userId, orgId))) return null;
  return db
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.member.role,
      publicKey: schema.vault.publicKey,
      joinedAt: schema.member.createdAt,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .leftJoin(schema.vault, eq(schema.vault.userId, schema.member.userId))
    .where(eq(schema.member.organizationId, orgId))
    .orderBy(schema.member.createdAt);
}

export type RoleResult = "ok" | "forbidden" | "not-found" | "bad-role";

/** Owners promote members to admin and demote admins. Nobody changes an owner here, so an owner always exists. */
export async function changeRole(db: Db, actorId: string, orgId: string, targetId: string, role: string): Promise<RoleResult> {
  const actor = await roleIn(db, actorId, orgId);
  if (!actor) return "not-found";
  if (actor !== "owner") return "forbidden";
  if (role !== "admin" && role !== "member") return "bad-role";
  const target = await roleIn(db, targetId, orgId);
  if (!target) return "not-found";
  if (target === "owner" || targetId === actorId) return "forbidden";
  await db
    .update(schema.member)
    .set({ role })
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, targetId)));
  return "ok";
}

export type Recipient = { userId: string; publicKey: string };
export type RotationNeeded = { envId: string; envName: string; projectName: string; keyVersion: number; recipients: Recipient[] };

export type RemovalPlan =
  | { status: "ok"; environments: RotationNeeded[] }
  | { status: "forbidden" | "not-found" }
  | { status: "needs-key"; environments: string[] };

/** An owner may remove admins and members; an admin may remove members. Never an owner, never yourself. */
const mayRemove = (actor: OrgRole, target: OrgRole) => (actor === "owner" && target !== "owner") || (actor === "admin" && target === "member");

/**
 * What removing `targetId` requires: every environment of the org the target can
 * open gets a new key version, wrapped to everyone else who holds the current one.
 * The server computes this, and the removal is refused unless the browser answers exactly it.
 */
export async function planRemoval(db: Db, actorId: string, orgId: string, targetId: string): Promise<RemovalPlan> {
  const actor = await roleIn(db, actorId, orgId);
  if (!actor) return { status: "not-found" };
  const target = await roleIn(db, targetId, orgId);
  if (!target) return { status: "not-found" };
  if (actorId === targetId || !mayRemove(actor, target)) return { status: "forbidden" };

  const envs = await db
    .select({
      envId: schema.environment.id,
      envName: schema.environment.name,
      projectName: schema.project.name,
      keyVersion: schema.environment.currentKeyVersion,
    })
    .from(schema.environmentKeyGrant)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.environmentKeyGrant.envId))
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .where(
      and(
        eq(schema.project.organizationId, orgId),
        eq(schema.environmentKeyGrant.principalType, "user"),
        eq(schema.environmentKeyGrant.principalId, targetId),
      ),
    )
    .groupBy(schema.environment.id);
  if (envs.length === 0) return { status: "ok", environments: [] };

  const holders = await db
    .select({ envId: schema.environmentKeyGrant.envId, userId: schema.environmentKeyGrant.principalId, keyVersion: schema.environmentKeyGrant.keyVersion, publicKey: schema.vault.publicKey })
    .from(schema.environmentKeyGrant)
    .innerJoin(schema.vault, eq(schema.vault.userId, schema.environmentKeyGrant.principalId))
    .where(and(inArray(schema.environmentKeyGrant.envId, envs.map((e) => e.envId)), eq(schema.environmentKeyGrant.principalType, "user")));

  const environments: RotationNeeded[] = envs.map((e) => ({
    ...e,
    recipients: holders
      .filter((h) => h.envId === e.envId && h.keyVersion === e.keyVersion && h.userId !== targetId)
      .map((h) => ({ userId: h.userId, publicKey: h.publicKey })),
  }));
  // Whoever rotates learns the new key, so they must already be able to open every one of these.
  const blocked = environments.filter((e) => !e.recipients.some((r) => r.userId === actorId));
  if (blocked.length) return { status: "needs-key", environments: blocked.map((e) => `${e.projectName} / ${e.envName}`) };
  return { status: "ok", environments };
}

export type RemoveResult =
  | { status: "removed"; rotated: { envId: string; keyVersion: number }[] }
  | { status: "forbidden" | "not-found" | "bad-rotation" | "stale" }
  | { status: "needs-key"; environments: string[] };

export type Rotation = { envId: string; grants: { userId: string; wrappedKey: string }[] };

/**
 * Remove a member and rotate every environment key they could open, in one
 * transaction: new key version N+1 for the remaining holders, the target's grants
 * and membership gone, and any pending invites that carry the old key revoked.
 */
export async function removeMember(db: Db, actorId: string, orgId: string, targetId: string, rotations: Rotation[], now = new Date()): Promise<RemoveResult> {
  const plan = await planRemoval(db, actorId, orgId, targetId);
  if (plan.status !== "ok") return plan;

  const byEnv = new Map(rotations.map((r) => [r.envId, r]));
  if (byEnv.size !== rotations.length || byEnv.size !== plan.environments.length) return { status: "bad-rotation" };
  for (const need of plan.environments) {
    const r = byEnv.get(need.envId);
    if (!r) return { status: "bad-rotation" };
    const want = new Map(need.recipients.map((x) => [x.userId, x.publicKey]));
    const got = new Set(r.grants.map((g) => g.userId));
    if (got.size !== r.grants.length || got.size !== want.size || [...got].some((u) => !want.has(u))) return { status: "bad-rotation" };
    for (const g of r.grants) {
      if (checkWrappedKey(g.wrappedKey, want.get(g.userId)!.split("|")[1] === "p256" ? "p256" : "x25519")) return { status: "bad-rotation" };
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const need of plan.environments) {
        const bumped = await tx
          .update(schema.environment)
          .set({ currentKeyVersion: need.keyVersion + 1 })
          .where(and(eq(schema.environment.id, need.envId), eq(schema.environment.currentKeyVersion, need.keyVersion)))
          .returning({ id: schema.environment.id });
        if (bumped.length === 0) throw new Error("stale");
        await tx.insert(schema.environmentKeyGrant).values(
          byEnv.get(need.envId)!.grants.map((g) => ({
            envId: need.envId,
            principalType: "user" as const,
            principalId: g.userId,
            keyVersion: need.keyVersion + 1,
            wrappedKey: g.wrappedKey,
          })),
        );
      }
      const rotatedEnvs = plan.environments.map((e) => e.envId);
      const orgEnvs = tx
        .select({ id: schema.environment.id })
        .from(schema.environment)
        .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
        .where(eq(schema.project.organizationId, orgId));
      await tx
        .delete(schema.environmentKeyGrant)
        .where(
          and(
            eq(schema.environmentKeyGrant.principalType, "user"),
            eq(schema.environmentKeyGrant.principalId, targetId),
            inArray(schema.environmentKeyGrant.envId, orgEnvs),
          ),
        );
      // Pending invites made by them, or holding a key they could read, must not outlive the removal.
      const carrying = rotatedEnvs.length
        ? tx.select({ id: schema.inviteGrant.inviteId }).from(schema.inviteGrant).where(inArray(schema.inviteGrant.envId, rotatedEnvs))
        : null;
      await tx
        .update(schema.invite)
        .set({ revokedAt: now })
        .where(
          and(
            eq(schema.invite.organizationId, orgId),
            isNull(schema.invite.usedAt),
            isNull(schema.invite.revokedAt),
            carrying ? or(eq(schema.invite.createdBy, targetId), inArray(schema.invite.id, carrying)) : eq(schema.invite.createdBy, targetId),
          ),
        );
      await tx
        .delete(schema.environmentWrite)
        .where(and(eq(schema.environmentWrite.userId, targetId), inArray(schema.environmentWrite.envId, orgEnvs)));
      await tx
        .delete(schema.regrantRequest)
        .where(and(eq(schema.regrantRequest.userId, targetId), inArray(schema.regrantRequest.envId, orgEnvs)));
      await tx.delete(schema.member).where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, targetId)));
    });
  } catch (e) {
    if ((e as Error).message === "stale") return { status: "stale" };
    throw e;
  }
  return { status: "removed", rotated: plan.environments.map((e) => ({ envId: e.envId, keyVersion: e.keyVersion + 1 })) };
}
