import { and, eq, inArray } from "drizzle-orm";
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

export type RegrantNeed = { envId: string; envName: string; projectName: string; keyVersions: number[] };
export type RegrantPlan =
  | { status: "ok"; publicKey: string; environments: RegrantNeed[]; skipped: string[] }
  | { status: "forbidden" | "not-found" | "nothing" };

/**
 * What re-sharing with `targetId` involves: for each environment they are waiting on that the actor
 * can open, every key version the actor holds. Environments the actor cannot open are left for
 * someone who can (they are listed as skipped, never silently granted).
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

  const mine = await db
    .select({ envId: schema.environmentKeyGrant.envId, keyVersion: schema.environmentKeyGrant.keyVersion })
    .from(schema.environmentKeyGrant)
    .where(and(inArray(schema.environmentKeyGrant.envId, wanted.map((w) => w.envId)), eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, actorId)));
  const environments: RegrantNeed[] = [];
  const skipped: string[] = [];
  for (const w of wanted) {
    const versions = mine.filter((m) => m.envId === w.envId).map((m) => m.keyVersion).sort((a, b) => a - b);
    if (versions.includes(w.current)) environments.push({ envId: w.envId, envName: w.envName, projectName: w.projectName, keyVersions: versions });
    else skipped.push(`${w.projectName} / ${w.envName}`);
  }
  if (environments.length === 0) return { status: "nothing" };
  return { status: "ok", publicKey: vault.publicKey, environments, skipped };
}

export type RegrantResult = { status: "granted"; envIds: string[] } | { status: "forbidden" | "not-found" | "nothing" | "bad-grants" };

/** Share every key version the actor holds with the member's new key; the set must match exactly. */
export async function applyRegrant(
  db: Db,
  actorId: string,
  orgId: string,
  targetId: string,
  grants: { envId: string; keyVersion: number; wrappedKey: string }[],
): Promise<RegrantResult> {
  const plan = await planRegrant(db, actorId, orgId, targetId);
  if (plan.status !== "ok") return plan;
  const want = new Set(plan.environments.flatMap((e) => e.keyVersions.map((v) => `${e.envId}:${v}`)));
  const got = new Set(grants.map((g) => `${g.envId}:${g.keyVersion}`));
  if (got.size !== grants.length || got.size !== want.size || [...got].some((k) => !want.has(k))) return { status: "bad-grants" };
  const alg = plan.publicKey.split("|")[1] === "p256" ? "p256" : "x25519";
  if (grants.some((g) => checkWrappedKey(g.wrappedKey, alg))) return { status: "bad-grants" };

  const envIds = plan.environments.map((e) => e.envId);
  await db.transaction(async (tx) => {
    await tx.insert(schema.environmentKeyGrant).values(
      grants.map((g) => ({ envId: g.envId, principalType: "user" as const, principalId: targetId, keyVersion: g.keyVersion, wrappedKey: g.wrappedKey })),
    );
    await tx.delete(schema.regrantRequest).where(and(eq(schema.regrantRequest.userId, targetId), inArray(schema.regrantRequest.envId, envIds)));
  });
  return { status: "granted", envIds };
}
