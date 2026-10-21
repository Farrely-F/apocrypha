import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { insertPersonalWorkspace, type WorkspaceIds } from "../workspace/queries";
import type { VaultPayload } from "./payload";

type Db = LibSQLDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type ResetEnv = { envId: string; projectId: string; envName: string; projectName: string; orgName: string; orgId: string };
export type ResetImpact = {
  /** An owner or admin who still holds the current key can share these again with the new key. */
  recoverable: ResetEnv[];
  /** Nobody else can open these, so once the old key is gone their secrets are unreadable. */
  lost: ResetEnv[];
};

/** What a reset would do to this user's environments, decided on the server from who holds which key. */
export async function previewReset(db: Db | Tx, userId: string): Promise<ResetImpact> {
  const mine = await db
    .select({
      envId: schema.environment.id,
      projectId: schema.project.id,
      envName: schema.environment.name,
      projectName: schema.project.name,
      orgName: schema.organization.name,
      orgId: schema.organization.id,
      current: schema.environment.currentKeyVersion,
    })
    .from(schema.environmentKeyGrant)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.environmentKeyGrant.envId))
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.project.organizationId))
    .where(and(eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, userId)))
    .groupBy(schema.environment.id);
  const impact: ResetImpact = { recoverable: [], lost: [] };
  if (mine.length === 0) return impact;

  // Someone else who can re-share: an owner or admin of that org holding the current key version.
  const helpers = await db
    .select({ envId: schema.environmentKeyGrant.envId })
    .from(schema.environmentKeyGrant)
    .innerJoin(schema.environment, eq(schema.environment.id, schema.environmentKeyGrant.envId))
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .innerJoin(
      schema.member,
      and(eq(schema.member.organizationId, schema.project.organizationId), eq(schema.member.userId, schema.environmentKeyGrant.principalId)),
    )
    .where(
      and(
        inArray(schema.environmentKeyGrant.envId, mine.map((m) => m.envId)),
        eq(schema.environmentKeyGrant.principalType, "user"),
        ne(schema.environmentKeyGrant.principalId, userId),
        eq(schema.environmentKeyGrant.keyVersion, schema.environment.currentKeyVersion),
        inArray(schema.member.role, ["owner", "admin"]),
      ),
    );
  const helped = new Set(helpers.map((h) => h.envId));
  for (const { current, ...env } of mine) (helped.has(env.envId) ? impact.recoverable : impact.lost).push(env);
  return impact;
}

export type ResetResult = ({ status: "reset"; impact: ResetImpact } & WorkspaceIds) | { status: "no-vault" | "env-exists" };

/**
 * Replace the user's key pair. In one transaction: the vault row is swapped, every old grant is
 * deleted (they were wrapped to a key nobody can use any more), environments only they could open
 * are removed together with what is now empty, requests are recorded so an admin can re-grant the
 * rest, and a fresh personal workspace is created for the new key.
 */
export async function resetVault(db: Db, userId: string, payload: VaultPayload): Promise<ResetResult> {
  const [existing] = await db.select({ id: schema.vault.userId }).from(schema.vault).where(eq(schema.vault.userId, userId)).limit(1);
  if (!existing) return { status: "no-vault" };
  const [clash] = await db.select({ id: schema.environment.id }).from(schema.environment).where(eq(schema.environment.id, payload.workspace.envId)).limit(1);
  if (clash) return { status: "env-exists" };

  return db.transaction(async (tx) => {
    const impact = await previewReset(tx, userId);
    await tx
      .update(schema.vault)
      .set({ publicKey: payload.publicKey, passphraseBlob: payload.passphraseBlob, recoveryBlob: payload.recoveryBlob, updatedAt: new Date() })
      .where(eq(schema.vault.userId, userId));
    await tx.delete(schema.environmentKeyGrant).where(and(eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, userId)));
    if (impact.recoverable.length) {
      await tx.insert(schema.regrantRequest).values(impact.recoverable.map((e) => ({ envId: e.envId, userId })));
    }
    if (impact.lost.length) {
      await tx.delete(schema.environment).where(inArray(schema.environment.id, impact.lost.map((e) => e.envId)));
      // Projects left without an environment, then organisations left empty with only this user in them.
      await tx
        .delete(schema.project)
        .where(
          and(
            inArray(schema.project.id, impact.lost.map((e) => e.projectId)),
            sql`${schema.project.id} not in (select ${schema.environment.projectId} from ${schema.environment})`,
          ),
        );
      const soloOrgs = await tx
        .select({ id: schema.member.organizationId })
        .from(schema.member)
        .where(eq(schema.member.userId, userId));
      for (const { id } of soloOrgs) {
        const others = await tx.select({ id: schema.member.id }).from(schema.member).where(and(eq(schema.member.organizationId, id), ne(schema.member.userId, userId))).limit(1);
        const projects = await tx.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.organizationId, id)).limit(1);
        if (others.length === 0 && projects.length === 0) await tx.delete(schema.organization).where(eq(schema.organization.id, id));
      }
    }
    const ids = await insertPersonalWorkspace(tx, userId, payload.workspace);
    return { status: "reset" as const, impact, ...ids };
  });
}
