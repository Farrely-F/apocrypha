import { desc, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { log } from "../log";

type Db = LibSQLDatabase<typeof schema>;

/**
 * The record of what the system administrator looked at. A row is a time, the admin's opaque user id, a fixed
 * action name and, where it applies, the opaque id of the account involved. Nothing else can be written: the
 * writer refuses a row with an unknown action or a value that is not a plain id, so an email address cannot
 * reach this table even by mistake.
 */
export const ACCESS_ACTIONS = ["view_overview", "view_users", "reveal_email", "lookup_email", "view_health", "run_chain_check", "view_access_log"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

const OPAQUE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function retentionDays(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SYSTEM_ACCESS_LOG_DAYS ?? env.AUDIT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 180;
}

export function checkAccessEntry(entry: { actorId: string; action: string; subjectId?: string | null }): string | null {
  if (!(ACCESS_ACTIONS as readonly string[]).includes(entry.action)) return "unknown action";
  if (!OPAQUE_ID.test(entry.actorId)) return "actor is not an opaque id";
  if (entry.subjectId != null && !OPAQUE_ID.test(entry.subjectId)) return "subject is not an opaque id";
  return null;
}

export async function logAdminAccess(db: Db, entry: { actorId: string; action: AccessAction; subjectId?: string | null }, now = Date.now()): Promise<void> {
  const problem = checkAccessEntry(entry);
  if (problem) throw new Error(`refused to write an access log row: ${problem}`);
  await db.insert(schema.systemAccessLog).values({ id: crypto.randomUUID(), at: now, actorId: entry.actorId, action: entry.action, subjectId: entry.subjectId ?? null });
  // Older rows go when new ones are written: no job to run, nothing kept past the window.
  await db.delete(schema.systemAccessLog).where(lt(schema.systemAccessLog.at, now - retentionDays() * 86_400_000));
  log.info("admin.access", { action: entry.action, actorId: entry.actorId });
}

export type AccessRow = { id: string; at: number; actorId: string; action: string; subjectId: string | null };

export async function listAccessLog(db: Db, limit = 50): Promise<AccessRow[]> {
  return db.select().from(schema.systemAccessLog).orderBy(desc(schema.systemAccessLog.at)).limit(Math.min(limit, 200));
}
