import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import { checkWrappedKey } from "../vault/payload";

type Db = LibSQLDatabase<typeof schema>;
const BUILDERS: readonly OrgRole[] = ["owner", "admin"];
export type Level = "none" | "read" | "write";
const algOf = (publicKey: string) => (publicKey.split("|")[1] === "p256" ? "p256" : "x25519");

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export type AccessTable = {
  environments: { envId: string; envName: string; projectName: string }[];
  members: { userId: string; name: string; role: OrgRole; levels: Record<string, Level> }[];
};

/**
 * Who can do what in each environment the actor can open. Owners and admins are always "write" (their
 * role says so); plain members are none, read (they hold the key) or write (key + write grant).
 * The actor only sees environments they can open, because granting needs the key.
 */
export async function listAccess(db: Db, actorId: string, orgId: string): Promise<AccessTable | null> {
  const role = await roleIn(db, actorId, orgId);
  if (!role || !BUILDERS.includes(role)) return null;
  const envs = await db
    .select({ envId: schema.environment.id, envName: schema.environment.name, projectName: schema.project.name })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(
      schema.environmentKeyGrant,
      and(eq(schema.environmentKeyGrant.envId, schema.environment.id), eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, actorId)),
    )
    .where(eq(schema.project.organizationId, orgId))
    .groupBy(schema.environment.id)
    .orderBy(schema.project.name, schema.environment.name);
  const people = await db
    .select({ userId: schema.user.id, name: schema.user.name, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, orgId))
    .orderBy(schema.member.createdAt);
  const ids = envs.map((e) => e.envId);
  const grants = ids.length
    ? await db
        .selectDistinct({ envId: schema.environmentKeyGrant.envId, userId: schema.environmentKeyGrant.principalId })
        .from(schema.environmentKeyGrant)
        .where(and(inArray(schema.environmentKeyGrant.envId, ids), eq(schema.environmentKeyGrant.principalType, "user")))
    : [];
  const writes = ids.length ? await db.select().from(schema.environmentWrite).where(inArray(schema.environmentWrite.envId, ids)) : [];
  const has = new Set(grants.map((g) => `${g.envId}:${g.userId}`));
  const canWrite = new Set(writes.map((w) => `${w.envId}:${w.userId}`));
  return {
    environments: envs,
    members: people.map((p) => ({
      ...p,
      levels: Object.fromEntries(
        ids.map((id) => {
          const k = `${id}:${p.userId}`;
          const level: Level = BUILDERS.includes(p.role) ? "write" : has.has(k) ? (canWrite.has(k) ? "write" : "read") : "none";
          return [id, level];
        }),
      ),
    })),
  };
}

export type AccessPlan =
  | {
      status: "ok";
      current: Level;
      publicKey: string;
      currentKeyVersion: number;
      /** Every key version the actor holds: what a newly granted member receives. */
      keyVersions: number[];
      /** Everyone else who holds the current key (the actor included): who receives the new key if access is taken away. */
      recipients: { userId: string; publicKey: string }[];
    }
  | { status: "forbidden" | "not-found" | "needs-key" | "not-a-member-role" };

/** What changing one member's access to one environment involves. The target must be a plain member. */
export async function planAccess(db: Db, actorId: string, orgId: string, targetId: string, envId: string): Promise<AccessPlan> {
  const actor = await roleIn(db, actorId, orgId);
  const target = await roleIn(db, targetId, orgId);
  if (!actor || !target) return { status: "not-found" };
  if (!BUILDERS.includes(actor)) return { status: "forbidden" };
  if (target !== "member" || actorId === targetId) return { status: "not-a-member-role" };
  const [env] = await db
    .select({ current: schema.environment.currentKeyVersion })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .where(and(eq(schema.environment.id, envId), eq(schema.project.organizationId, orgId)))
    .limit(1);
  if (!env) return { status: "not-found" };
  const [vault] = await db.select({ publicKey: schema.vault.publicKey }).from(schema.vault).where(eq(schema.vault.userId, targetId)).limit(1);
  if (!vault) return { status: "not-found" };

  const holders = await db
    .select({ userId: schema.environmentKeyGrant.principalId, keyVersion: schema.environmentKeyGrant.keyVersion, publicKey: schema.vault.publicKey })
    .from(schema.environmentKeyGrant)
    .innerJoin(schema.vault, eq(schema.vault.userId, schema.environmentKeyGrant.principalId))
    .where(and(eq(schema.environmentKeyGrant.envId, envId), eq(schema.environmentKeyGrant.principalType, "user")));
  const mine = holders.filter((h) => h.userId === actorId).map((h) => h.keyVersion).sort((a, b) => a - b);
  if (!mine.includes(env.current)) return { status: "needs-key" };
  const targetHolds = holders.some((h) => h.userId === targetId);
  const [flag] = await db
    .select({ envId: schema.environmentWrite.envId })
    .from(schema.environmentWrite)
    .where(and(eq(schema.environmentWrite.envId, envId), eq(schema.environmentWrite.userId, targetId)))
    .limit(1);
  return {
    status: "ok",
    current: targetHolds ? (flag ? "write" : "read") : "none",
    publicKey: vault.publicKey,
    currentKeyVersion: env.current,
    keyVersions: mine,
    recipients: holders.filter((h) => h.keyVersion === env.current && h.userId !== targetId).map((h) => ({ userId: h.userId, publicKey: h.publicKey })),
  };
}

export type AccessChange = {
  level: Level;
  /** none -> read/write: the actor's key versions wrapped to the member's key. */
  grants?: { keyVersion: number; wrappedKey: string }[];
  /** read/write -> none: the NEW key version wrapped to every remaining holder. */
  rotation?: { userId: string; wrappedKey: string }[];
};
export type AccessResult =
  | { status: "changed"; from: Level; to: Level; rotated: boolean }
  | { status: "forbidden" | "not-found" | "needs-key" | "not-a-member-role" | "bad-keys" | "stale" | "unchanged" };

/**
 * Move a member to none / read / write for one environment.
 *  - none -> read|write hands them every key version we hold (no rotation: nothing is being taken away).
 *  - read <-> write only flips the write grant (no keys involved).
 *  - read|write -> none rotates the environment key to a new version for everyone who keeps access, so
 *    the person keeps nothing that opens what is written from now on.
 */
export async function setAccess(db: Db, actorId: string, orgId: string, targetId: string, envId: string, change: AccessChange, now = new Date()): Promise<AccessResult> {
  const plan = await planAccess(db, actorId, orgId, targetId, envId);
  if (plan.status !== "ok") return plan;
  const from = plan.current;
  const to = change.level;
  if (from === to) return { status: "unchanged" };
  const writeRow = { envId, userId: targetId };

  if (from === "none") {
    const want = new Set(plan.keyVersions);
    const got = new Set((change.grants ?? []).map((g) => g.keyVersion));
    if (!change.grants || got.size !== change.grants.length || got.size !== want.size || [...got].some((v) => !want.has(v))) return { status: "bad-keys" };
    if (change.grants.some((g) => checkWrappedKey(g.wrappedKey, algOf(plan.publicKey)))) return { status: "bad-keys" };
    await db.transaction(async (tx) => {
      await tx.insert(schema.environmentKeyGrant).values(change.grants!.map((g) => ({ envId, principalType: "user" as const, principalId: targetId, keyVersion: g.keyVersion, wrappedKey: g.wrappedKey })));
      if (to === "write") await tx.insert(schema.environmentWrite).values(writeRow);
      await tx.delete(schema.regrantRequest).where(and(eq(schema.regrantRequest.userId, targetId), eq(schema.regrantRequest.envId, envId)));
    });
    return { status: "changed", from, to, rotated: false };
  }

  if (to === "none") {
    const want = new Map(plan.recipients.map((r) => [r.userId, r.publicKey]));
    const got = new Set((change.rotation ?? []).map((g) => g.userId));
    if (!change.rotation || got.size !== change.rotation.length || got.size !== want.size || [...got].some((u) => !want.has(u))) return { status: "bad-keys" };
    if (change.rotation.some((g) => checkWrappedKey(g.wrappedKey, algOf(want.get(g.userId)!)))) return { status: "bad-keys" };
    try {
      await db.transaction(async (tx) => {
        const bumped = await tx
          .update(schema.environment)
          .set({ currentKeyVersion: plan.currentKeyVersion + 1 })
          .where(and(eq(schema.environment.id, envId), eq(schema.environment.currentKeyVersion, plan.currentKeyVersion)))
          .returning({ id: schema.environment.id });
        if (bumped.length === 0) throw new Error("stale");
        await tx.insert(schema.environmentKeyGrant).values(change.rotation!.map((g) => ({ envId, principalType: "user" as const, principalId: g.userId, keyVersion: plan.currentKeyVersion + 1, wrappedKey: g.wrappedKey })));
        await tx.delete(schema.environmentKeyGrant).where(and(eq(schema.environmentKeyGrant.envId, envId), eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, targetId)));
        await tx.delete(schema.environmentWrite).where(and(eq(schema.environmentWrite.envId, envId), eq(schema.environmentWrite.userId, targetId)));
        // A pending invite or share built on the old key must not outlive the downgrade.
        const carrying = tx.select({ id: schema.inviteGrant.inviteId }).from(schema.inviteGrant).where(eq(schema.inviteGrant.envId, envId));
        await tx
          .update(schema.invite)
          .set({ revokedAt: now })
          .where(and(eq(schema.invite.organizationId, orgId), isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt), or(eq(schema.invite.createdBy, targetId), inArray(schema.invite.id, carrying))));
      });
    } catch (e) {
      if ((e as Error).message === "stale") return { status: "stale" };
      throw e;
    }
    return { status: "changed", from, to, rotated: true };
  }

  // read <-> write
  if (to === "write") await db.insert(schema.environmentWrite).values(writeRow).onConflictDoNothing();
  else await db.delete(schema.environmentWrite).where(and(eq(schema.environmentWrite.envId, envId), eq(schema.environmentWrite.userId, targetId)));
  return { status: "changed", from, to, rotated: false };
}

