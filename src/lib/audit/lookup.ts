import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { audit } from "./store";

type Db = LibSQLDatabase<typeof schema>;

export async function orgOfEnv(db: Db, envId: string): Promise<string | null> {
  const [r] = await db
    .select({ orgId: schema.project.organizationId })
    .from(schema.environment)
    .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
    .where(eq(schema.environment.id, envId))
    .limit(1);
  return r?.orgId ?? null;
}

export async function orgOfProject(db: Db, projectId: string): Promise<string | null> {
  const [r] = await db.select({ orgId: schema.project.organizationId }).from(schema.project).where(eq(schema.project.id, projectId)).limit(1);
  return r?.orgId ?? null;
}

export async function orgOfInvite(db: Db, inviteId: string): Promise<string | null> {
  const [r] = await db.select({ orgId: schema.invite.organizationId }).from(schema.invite).where(eq(schema.invite.id, inviteId)).limit(1);
  return r?.orgId ?? null;
}

export async function orgOfShare(db: Db, shareId: string): Promise<{ orgId: string; envId: string } | null> {
  const [r] = await db.select({ orgId: schema.share.organizationId, envId: schema.share.envId }).from(schema.share).where(eq(schema.share.id, shareId)).limit(1);
  return r ?? null;
}

/** An account-level event (a passphrase change, a vault reset) is recorded in every organisation the person belongs to. */
export async function auditAccount(db: Db, userId: string, type: string, data: Record<string, string | number | boolean | null> = {}): Promise<void> {
  const orgs = await db.select({ orgId: schema.member.organizationId }).from(schema.member).where(eq(schema.member.userId, userId));
  for (const { orgId } of orgs) await audit(db, { orgId, actorId: userId, targetUserId: userId, type, data });
}
