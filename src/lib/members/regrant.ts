import { and, eq, inArray, ne } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import { checkWrappedKey } from "../vault/payload";

type Db = LibSQLDatabase<typeof schema>;
const BUILDERS: readonly OrgRole[] = ["owner", "admin"];

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

/** Members of the org who reset their vault and are waiting for access, for owners and admins. */
export async function pendingRegrants(db: Db, actorId: string, orgId: string): Promise<string[] | null> {
  const role = await roleIn(db, actorId, orgId);
  if (!role || !BUILDERS.includes(role)) return null;
  const rows = await db
    .selectDistinct({ userId: schema.regrantRequest.userId })
    .from(schema.regrantRequest)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.regrantRequest.envId))
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(schema.member, and(eq(schema.member.organizationId, schema.project.organizationId), eq(schema.member.userId, schema.regrantRequest.userId)))
    .where(eq(schema.project.organizationId, orgId));
  return rows.map((r) => r.userId);
}

export type Recipient = { userId: string; publicKey: string };
export type RegrantNeed = { envId: string; envName: string; projectName: string; currentKeyVersion: number; keyVersions: number[]; recipients: Recipient[] };
export type RegrantPlan =
  | { status: "ok"; publicKey: string; environments: RegrantNeed[]; skipped: string[] }
  | { status: "forbidden" | "not-found" | "nothing" };

/**
 * What re-sharing with `targetId` involves. The old key pair may be lost or stolen, so re-sharing also
 * rotates: each environment gets a new key version that only people holding a current key (plus the
 * member's NEW key) can open. The member also receives every older version the actor holds, so history
 * stays readable. Environments the actor cannot open are skipped for someone who can.
 */
export async function planRegrant(db: Db, actorId: string, orgId: string, targetId: string): Promise<RegrantPlan> {
  const actor = await roleIn(db, actorId, orgId);
  const target = await roleIn(db, targetId, orgId);
  if (!actor || !target) return { status: "not-found" };
  if (!BUILDERS.includes(actor)) return { status: "forbidden" };
  const [vault] = await db.select({ publicKey: schema.vault.publicKey }).from(schema.vault).where(eq(schema.vault.userId, targetId)).limit(1);
  if (!vault) return { status: "not-found" };

  const wanted = await db
    .select({ envId: schema.environment.id, envName: schema.environment.name, projectName: schema.project.name, current: schema.environment.currentKeyVersion })
    .from(schema.regrantRequest)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.regrantRequest.envId))
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .where(and(eq(schema.regrantRequest.userId, targetId), eq(schema.project.organizationId, orgId)));
  if (wanted.length === 0) return { status: "nothing" };

  const ids = wanted.map((w) => w.envId);
  const holders = await db
    .select({ envId: schema.environmentKeyGrant.envId, userId: schema.environmentKeyGrant.principalId, keyVersion: schema.environmentKeyGrant.keyVersion, publicKey: schema.vault.publicKey })
    .from(schema.environmentKeyGrant)
    .innerJoin(schema.vault, eq(schema.vault.userId, schema.environmentKeyGrant.principalId))
    .where(and(inArray(schema.environmentKeyGrant.envId, ids), eq(schema.environmentKeyGrant.principalType, "user"), ne(schema.environmentKeyGrant.principalId, targetId)));
  const environments: RegrantNeed[] = [];
  const skipped: string[] = [];
  for (const w of wanted) {
    const here = holders.filter((h) => h.envId === w.envId);
    const versions = here.filter((h) => h.userId === actorId).map((h) => h.keyVersion).sort((a, b) => a - b);
    if (!versions.includes(w.current)) {
      skipped.push(`${w.projectName} / ${w.envName}`);
      continue;
    }
    environments.push({
      envId: w.envId,
      envName: w.envName,
      projectName: w.projectName,
      currentKeyVersion: w.current,
      keyVersions: versions,
      recipients: here.filter((h) => h.keyVersion === w.current).map((h) => ({ userId: h.userId, publicKey: h.publicKey })),
    });
  }
  if (environments.length === 0) return { status: "nothing" };
  return { status: "ok", publicKey: vault.publicKey, environments, skipped };
}

export type RegrantEnv = {
  envId: string;
  /** Wrapped to the member's new key: every version the actor holds, plus the new current version. */
  forTarget: { keyVersion: number; wrappedKey: string }[];
  /** The new current version, wrapped to each other holder (the actor included). */
  forOthers: { userId: string; wrappedKey: string }[];
};
export type RegrantResult = { status: "granted"; envIds: string[] } | { status: "forbidden" | "not-found" | "nothing" | "bad-grants" | "stale" };

const algOf = (publicKey: string) => (publicKey.split("|")[1] === "p256" ? "p256" : "x25519");

/** Apply a re-grant. The server recomputes who must receive what and requires an exact match. */
export async function applyRegrant(db: Db, actorId: string, orgId: string, targetId: string, envs: RegrantEnv[]): Promise<RegrantResult> {
  const plan = await planRegrant(db, actorId, orgId, targetId);
  if (plan.status !== "ok") return plan;
  const byEnv = new Map(envs.map((e) => [e.envId, e]));
  if (byEnv.size !== envs.length || byEnv.size !== plan.environments.length) return { status: "bad-grants" };

  const targetAlg = algOf(plan.publicKey);
  for (const need of plan.environments) {
    const e = byEnv.get(need.envId);
    if (!e) return { status: "bad-grants" };
    const wantVersions = new Set([...need.keyVersions, need.currentKeyVersion + 1]);
    const gotVersions = new Set(e.forTarget.map((g) => g.keyVersion));
    if (gotVersions.size !== e.forTarget.length || gotVersions.size !== wantVersions.size || [...gotVersions].some((v) => !wantVersions.has(v))) return { status: "bad-grants" };
    if (e.forTarget.some((g) => checkWrappedKey(g.wrappedKey, targetAlg))) return { status: "bad-grants" };
    const want = new Map(need.recipients.map((r) => [r.userId, r.publicKey]));
    const got = new Set(e.forOthers.map((g) => g.userId));
    if (got.size !== e.forOthers.length || got.size !== want.size || [...got].some((u) => !want.has(u))) return { status: "bad-grants" };
    if (e.forOthers.some((g) => checkWrappedKey(g.wrappedKey, algOf(want.get(g.userId)!)))) return { status: "bad-grants" };
  }

  try {
    await db.transaction(async (tx) => {
      for (const need of plan.environments) {
        const e = byEnv.get(need.envId)!;
        const bumped = await tx
          .update(schema.environment)
          .set({ currentKeyVersion: need.currentKeyVersion + 1 })
          .where(and(eq(schema.environment.id, need.envId), eq(schema.environment.currentKeyVersion, need.currentKeyVersion)))
          .returning({ id: schema.environment.id });
        if (bumped.length === 0) throw new Error("stale");
        await tx.insert(schema.environmentKeyGrant).values([
          ...e.forTarget.map((g) => ({ envId: need.envId, principalType: "user" as const, principalId: targetId, keyVersion: g.keyVersion, wrappedKey: g.wrappedKey })),
          ...e.forOthers.map((g) => ({ envId: need.envId, principalType: "user" as const, principalId: g.userId, keyVersion: need.currentKeyVersion + 1, wrappedKey: g.wrappedKey })),
        ]);
      }
      await tx.delete(schema.regrantRequest).where(and(eq(schema.regrantRequest.userId, targetId), inArray(schema.regrantRequest.envId, plan.environments.map((n) => n.envId))));
    });
  } catch (err) {
    if ((err as Error).message === "stale") return { status: "stale" };
    throw err;
  }
  return { status: "granted", envIds: plan.environments.map((n) => n.envId) };
}
