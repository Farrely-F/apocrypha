import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { OrgRole } from "../db/schema";
import { entryHash, GENESIS, verifyChain, type ChainCheck, type ChainEntry } from "./chain";

type Db = LibSQLDatabase<typeof schema>;

export type AuditInput = {
  orgId: string;
  actorId: string | null;
  type: string;
  envId?: string | null;
  targetUserId?: string | null;
  /** Ids and numbers only. Never a secret name or value. */
  data?: Record<string, string | number | boolean | null>;
};

/**
 * Append one event to the org's chain. The next sequence number and previous hash are read inside the
 * transaction, and the unique (org, seq) index turns a concurrent append into a retry, so the chain never forks.
 */
export async function recordAudit(db: Db, input: AuditInput, now = Date.now()): Promise<void> {
  const MAX = 20;
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      await db.transaction(async (tx) => {
        const [last] = await tx
          .select({ seq: schema.auditEvent.seq, hash: schema.auditEvent.hash })
          .from(schema.auditEvent)
          .where(eq(schema.auditEvent.organizationId, input.orgId))
          .orderBy(desc(schema.auditEvent.seq))
          .limit(1);
        const [cp] = last ? [] : await tx.select().from(schema.auditCheckpoint).where(eq(schema.auditCheckpoint.organizationId, input.orgId)).limit(1);
        const prev = last ?? cp ?? { seq: 0, hash: GENESIS };
        const fields = {
          organizationId: input.orgId,
          seq: prev.seq + 1,
          createdAt: now,
          actorId: input.actorId,
          type: input.type,
          envId: input.envId ?? null,
          targetUserId: input.targetUserId ?? null,
          data: JSON.stringify(input.data ?? {}),
          prevHash: prev.hash,
        };
        await tx.insert(schema.auditEvent).values({ id: crypto.randomUUID(), ...fields, hash: entryHash(fields) });
      });
      return;
    } catch (e) {
      // Another append won the sequence number, or the database was briefly locked: wait a moment and redo it.
      const text = String((e as Error).message) + String((e as { cause?: unknown }).cause) + String((e as { code?: unknown }).code);
      if (attempt === MAX - 1 || !/UNIQUE|constraint|SQLITE_BUSY|locked/i.test(text)) throw e;
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 25 * (attempt + 1)));
    }
  }
}

/** Never let a logging failure break the action that was just done; say so loudly instead. */
export async function audit(db: Db, input: AuditInput): Promise<void> {
  try {
    await recordAudit(db, input);
  } catch (e) {
    console.error("audit log write failed:", input.type, (e as Error).message.slice(0, 120));
  }
}

async function roleIn(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export type AuditRow = ChainEntry & { id: string; actorName: string | null; envName: string | null; targetName: string | null };

/**
 * Newest first. Owners and admins see the whole org log. A member sees events on environments they
 * hold, and events about or by themselves. Anyone else gets null.
 */
export async function listAudit(db: Db, userId: string, orgId: string, opts: { before?: number; limit?: number } = {}): Promise<{ events: AuditRow[]; scope: "org" | "own" } | null> {
  const role = await roleIn(db, userId, orgId);
  if (!role) return null;
  const full = role === "owner" || role === "admin";
  const held = full
    ? null
    : (
        await db
          .select({ envId: schema.environmentKeyGrant.envId })
          .from(schema.environmentKeyGrant)
          .where(and(eq(schema.environmentKeyGrant.principalType, "user"), eq(schema.environmentKeyGrant.principalId, userId)))
      ).map((g) => g.envId);
  const scope = full
    ? undefined
    : or(eq(schema.auditEvent.actorId, userId), eq(schema.auditEvent.targetUserId, userId), held && held.length ? inArray(schema.auditEvent.envId, held) : sql`0`);
  const actor = schema.user;
  const rows = await db
    .select({
      id: schema.auditEvent.id,
      organizationId: schema.auditEvent.organizationId,
      seq: schema.auditEvent.seq,
      createdAt: schema.auditEvent.createdAt,
      actorId: schema.auditEvent.actorId,
      type: schema.auditEvent.type,
      envId: schema.auditEvent.envId,
      targetUserId: schema.auditEvent.targetUserId,
      data: schema.auditEvent.data,
      prevHash: schema.auditEvent.prevHash,
      hash: schema.auditEvent.hash,
      actorName: actor.name,
      envName: schema.environment.name,
    })
    .from(schema.auditEvent)
    .leftJoin(actor, eq(actor.id, schema.auditEvent.actorId))
    .leftJoin(schema.environment, eq(schema.environment.id, schema.auditEvent.envId))
    .where(and(eq(schema.auditEvent.organizationId, orgId), opts.before ? lt(schema.auditEvent.seq, opts.before) : undefined, scope))
    .orderBy(desc(schema.auditEvent.seq))
    .limit(Math.min(opts.limit ?? 100, 500));
  const targets = [...new Set(rows.map((r) => r.targetUserId).filter((x): x is string => !!x))];
  const names = targets.length ? await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, targets)) : [];
  const byId = new Map(names.map((n) => [n.id, n.name]));
  return { scope: full ? "org" : "own", events: rows.map((r) => ({ ...r, targetName: r.targetUserId ? (byId.get(r.targetUserId) ?? null) : null })) };
}

/** Verify the whole stored chain of an org, from its checkpoint (if pruned) or the genesis. */
export async function verifyOrgChain(db: Db, orgId: string): Promise<ChainCheck> {
  const [cp] = await db.select().from(schema.auditCheckpoint).where(eq(schema.auditCheckpoint.organizationId, orgId)).limit(1);
  const rows = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.organizationId, orgId)).orderBy(asc(schema.auditEvent.seq));
  return verifyChain(rows, cp ? { seq: cp.seq, hash: cp.hash } : undefined);
}

export type AuditExport = { orgId: string; exportedAt: string; headHash: string; headSeq: number; count: number; prunedThrough: number; events: ChainEntry[] };

/** Owners only: the raw chain with its head hash, so it can be checked and kept elsewhere. */
export async function exportAudit(db: Db, userId: string, orgId: string, now = new Date()): Promise<AuditExport | "forbidden" | "not-found"> {
  const role = await roleIn(db, userId, orgId);
  if (!role) return "not-found";
  if (role !== "owner") return "forbidden";
  const [cp] = await db.select().from(schema.auditCheckpoint).where(eq(schema.auditCheckpoint.organizationId, orgId)).limit(1);
  const rows = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.organizationId, orgId)).orderBy(asc(schema.auditEvent.seq));
  const events: ChainEntry[] = rows.map(({ id: _id, ...e }) => e);
  const head = events.at(-1);
  return { orgId, exportedAt: now.toISOString(), headHash: head?.hash ?? cp?.hash ?? GENESIS, headSeq: head?.seq ?? cp?.seq ?? 0, count: events.length, prunedThrough: cp?.seq ?? 0, events };
}

export const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 180);

/** Drop events older than the retention window, remembering the last dropped hash so the rest still verifies. */
export async function pruneAudit(db: Db, orgId: string, now = Date.now(), days = RETENTION_DAYS): Promise<number> {
  const cutoff = now - days * 86_400_000;
  return db.transaction(async (tx) => {
    const old = await tx
      .select({ seq: schema.auditEvent.seq, hash: schema.auditEvent.hash })
      .from(schema.auditEvent)
      .where(and(eq(schema.auditEvent.organizationId, orgId), lt(schema.auditEvent.createdAt, cutoff)))
      .orderBy(desc(schema.auditEvent.seq))
      .limit(1);
    if (!old[0]) return 0;
    await tx.insert(schema.auditCheckpoint).values({ organizationId: orgId, seq: old[0].seq, hash: old[0].hash }).onConflictDoUpdate({ target: schema.auditCheckpoint.organizationId, set: { seq: old[0].seq, hash: old[0].hash } });
    const gone = await tx.delete(schema.auditEvent).where(and(eq(schema.auditEvent.organizationId, orgId), lt(schema.auditEvent.seq, old[0].seq + 1))).returning({ id: schema.auditEvent.id });
    return gone.length;
  });
}

/** Log reading an environment once per session. Returns whether this was the first read in the session. */
export async function noteEnvRead(db: Db, sessionId: string, envId: string): Promise<boolean> {
  const done = await db.insert(schema.auditEnvRead).values({ sessionId, envId }).onConflictDoNothing().returning({ envId: schema.auditEnvRead.envId });
  return done.length === 1;
}
