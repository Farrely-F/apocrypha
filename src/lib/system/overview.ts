import { and, count, desc, eq, gt, inArray, isNull, lt, max, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { categoryOf, DAYS, emptyDays, type DayBucket } from "../analytics/overview";
import { verifyChain, type ChainEntry } from "../audit/chain";
import * as schema from "../db/schema";
import journal from "../../../drizzle/meta/_journal.json";
import { maskEmail } from "./admin";

type Db = LibSQLDatabase<typeof schema>;
const DAY = 86_400_000;

/**
 * What the administrator sees. Counts and dates only: how many people, organisations and secrets exist, how the
 * service is used over time, and whether its own data is healthy. No person is identifiable from anything here
 * except the user list, which is minimal and masked (see listUsers).
 */
export type SystemOverview = {
  generatedAt: number;
  totals: { users: number; vaults: number; organisations: number; projects: number; environments: number; secrets: number; memberships: number };
  twoFactor: { enabled: number; users: number };
  providers: { provider: string; accounts: number }[];
  signups: { days: { day: string; n: number }[]; total: number };
  active: { day: number; week: number; month: number };
  activity: { days: DayBucket[]; total: number };
  inFlight: { activeShares: number; pendingInvites: number; peopleWaitingForAccess: number };
  tables: { name: string; rows: number }[];
  dbBytes: number | null;
};

/** The current time, for pages that print "5 minutes ago". */
export const nowMs = () => Date.now();

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function computeSystemOverview(db: Db, now = Date.now()): Promise<SystemOverview> {
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

  const [users, vaults, organisations, projects, environments, memberships, secretCount] = await Promise.all([
    n(db.select({ n: count() }).from(schema.user)),
    n(db.select({ n: count() }).from(schema.vault)),
    n(db.select({ n: count() }).from(schema.organization)),
    n(db.select({ n: count() }).from(schema.project)),
    n(db.select({ n: count() }).from(schema.environment)),
    n(db.select({ n: count() }).from(schema.member)),
    liveSecrets(db),
  ]);
  const twoFactorUsers = await n(db.select({ n: count() }).from(schema.user).where(eq(schema.user.twoFactorEnabled, true)));
  const providers = (await db.select({ provider: schema.account.providerId, accounts: count() }).from(schema.account).groupBy(schema.account.providerId).orderBy(desc(count()))).map((r) => ({ provider: r.provider, accounts: Number(r.accounts) }));

  const since = Date.parse(dayOf(now)) - (DAYS - 1) * DAY;
  const signupRows = await db
    .select({ day: sql<string>`strftime('%Y-%m-%d', ${schema.user.createdAt} / 1000, 'unixepoch')`, n: count() })
    .from(schema.user)
    .where(sql`${schema.user.createdAt} >= ${since}`)
    .groupBy(sql`1`);
  const bySignupDay = new Map(signupRows.map((r) => [r.day, Number(r.n)]));
  const signupDays = emptyDays(now).map((d) => ({ day: d.day, n: bySignupDay.get(d.day) ?? 0 }));

  const activeSince = (days: number) =>
    n(db.select({ n: sql<number>`count(distinct ${schema.session.userId})` }).from(schema.session).where(sql`${schema.session.updatedAt} >= ${now - days * DAY}`));
  const [day, week, month] = await Promise.all([activeSince(1), activeSince(7), activeSince(30)]);

  const days = emptyDays(now);
  const index = new Map(days.map((d, i) => [d.day, i]));
  let activityTotal = 0;
  const events = await db
    .select({ day: sql<string>`strftime('%Y-%m-%d', ${schema.auditEvent.createdAt} / 1000, 'unixepoch')`, type: schema.auditEvent.type, n: count() })
    .from(schema.auditEvent)
    .where(sql`${schema.auditEvent.createdAt} >= ${since}`)
    .groupBy(sql`1`, schema.auditEvent.type);
  for (const e of events) {
    const i = index.get(e.day);
    if (i === undefined) continue;
    days[i][categoryOf(e.type)] += Number(e.n);
    activityTotal += Number(e.n);
  }

  const activeShares = await n(db.select({ n: count() }).from(schema.share).where(and(isNull(schema.share.revokedAt), sql`(${schema.share.expiresAt} is null or ${schema.share.expiresAt} > ${now})`, sql`(${schema.share.maxViews} is null or ${schema.share.views} < ${schema.share.maxViews})`)));
  const pendingInvites = await n(db.select({ n: count() }).from(schema.invite).where(and(isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt), gt(schema.invite.expiresAt, new Date(now)))));
  const waiting = await n(db.select({ n: sql<number>`count(distinct ${schema.regrantRequest.userId})` }).from(schema.regrantRequest));

  const tables = await tableSizes(db);
  return {
    generatedAt: now,
    totals: { users, vaults, organisations, projects, environments, secrets: secretCount, memberships },
    twoFactor: { enabled: twoFactorUsers, users },
    providers,
    signups: { days: signupDays, total: signupDays.reduce((a, d) => a + d.n, 0) },
    active: { day, week, month },
    activity: { days, total: activityTotal },
    inFlight: { activeShares, pendingInvites, peopleWaitingForAccess: waiting },
    tables,
    dbBytes: await dbBytes(db),
  };
}

/** Secrets whose newest version is not a deletion. */
async function liveSecrets(db: Db): Promise<number> {
  const latest = db.select({ secretId: schema.secretVersion.secretId, v: max(schema.secretVersion.version).as("v") }).from(schema.secretVersion).groupBy(schema.secretVersion.secretId).as("latest");
  const rows = await db
    .select({ n: count() })
    .from(latest)
    .innerJoin(schema.secretVersion, and(eq(schema.secretVersion.secretId, latest.secretId), eq(schema.secretVersion.version, latest.v)))
    .where(eq(schema.secretVersion.deleted, false));
  return Number(rows[0]?.n ?? 0);
}

const TABLES = [
  ["user", schema.user],
  ["session", schema.session],
  ["account", schema.account],
  ["organization", schema.organization],
  ["member", schema.member],
  ["secret", schema.secret],
  ["secret_version", schema.secretVersion],
  ["audit_event", schema.auditEvent],
  ["share", schema.share],
  ["invite", schema.invite],
  ["rate_limit", schema.rateLimit],
  ["system_access_log", schema.systemAccessLog],
] as const;

async function tableSizes(db: Db) {
  const rows = await Promise.all(TABLES.map(async ([name, table]) => ({ name, rows: Number((await db.select({ n: count() }).from(table))[0]?.n ?? 0) })));
  return rows.sort((a, b) => b.rows - a.rows);
}

/** The database's size in bytes, or null where the driver cannot say (some hosted drivers refuse PRAGMA). */
export async function dbBytes(db: Db): Promise<number | null> {
  try {
    const r = await db.all<{ b: number }>(sql`select page_count * page_size as b from pragma_page_count(), pragma_page_size()`);
    const b = Number(r[0]?.b);
    return Number.isFinite(b) && b > 0 ? b : null;
  } catch {
    return null;
  }
}

// ---- health: always live, cheap ----

export type Health = {
  checkedAt: number;
  database: { ok: boolean; latencyMs: number | null };
  migrations: { applied: number | null; expected: number; state: "ok" | "pending" | "ahead" | "unknown" };
  rateLimit: { rows: number; expired: number };
  build: { environment: string; commit: string | null; region: string | null; node: string };
};

export const EXPECTED_MIGRATIONS = journal.entries.length;

export async function checkHealth(db: Db, env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<Health> {
  let ok = false;
  let latencyMs: number | null = null;
  try {
    const t = performance.now();
    await db.all(sql`select 1`);
    latencyMs = Math.round(performance.now() - t);
    ok = true;
  } catch {
    /* reported as not ok */
  }
  let applied: number | null = null;
  try {
    const r = await db.all<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`);
    applied = Number(r[0]?.n);
  } catch {
    applied = null;
  }
  const state = applied === null ? "unknown" : applied === EXPECTED_MIGRATIONS ? "ok" : applied < EXPECTED_MIGRATIONS ? "pending" : "ahead";
  let rows = 0;
  let expired = 0;
  try {
    rows = Number((await db.select({ n: count() }).from(schema.rateLimit))[0]?.n ?? 0);
    expired = Number((await db.select({ n: count() }).from(schema.rateLimit).where(lt(schema.rateLimit.expiresAt, now)))[0]?.n ?? 0);
  } catch {
    /* leave zeros */
  }
  return {
    checkedAt: now,
    database: { ok, latencyMs },
    migrations: { applied, expected: EXPECTED_MIGRATIONS, state },
    rateLimit: { rows, expired },
    build: { environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown", commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null, region: env.VERCEL_REGION ?? null, node: process.version },
  };
}

// ---- the chain check, on a button ----

export const CHAIN_CHECK_LIMITS = { orgs: 25, events: 5000 } as const;

export type ChainReport = { checkedOrgs: number; ok: number; events: number; broken: { orgId: string; brokenAt: number; reason: string }[]; limits: { orgs: number; events: number } };

/**
 * Verify the most recent events of the most recently active organisations: up to 25 organisations and 5,000
 * events each, so a run costs a bounded number of rows however large the service grows. A suffix is checked
 * against itself (each entry must follow the one before, and hash to what it says), which catches an edited,
 * missing or reordered row inside it.
 */
export async function checkAuditChains(db: Db, limits: { orgs: number; events: number } = CHAIN_CHECK_LIMITS): Promise<ChainReport> {
  const recent = await db
    .select({ orgId: schema.auditEvent.organizationId, last: max(schema.auditEvent.createdAt) })
    .from(schema.auditEvent)
    .groupBy(schema.auditEvent.organizationId)
    .orderBy(desc(max(schema.auditEvent.createdAt)))
    .limit(limits.orgs);
  const report: ChainReport = { checkedOrgs: recent.length, ok: 0, events: 0, broken: [], limits };
  for (const { orgId } of recent) {
    const rows = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.organizationId, orgId)).orderBy(desc(schema.auditEvent.seq)).limit(limits.events);
    rows.reverse();
    if (rows.length === 0) continue;
    const entries: ChainEntry[] = rows.map((r) => ({ organizationId: r.organizationId, seq: r.seq, createdAt: r.createdAt, actorId: r.actorId, type: r.type, envId: r.envId, targetUserId: r.targetUserId, data: r.data, prevHash: r.prevHash, hash: r.hash }));
    const first = entries[0];
    const result = verifyChain(entries, { seq: first.seq - 1, hash: first.prevHash });
    report.events += entries.length;
    if (result.ok) report.ok++;
    else report.broken.push({ orgId, brokenAt: result.brokenAt, reason: result.reason });
  }
  return report;
}

// ---- people: minimal and masked ----

export type UserRow = {
  id: string;
  maskedEmail: string;
  joinedAt: number;
  lastActiveAt: number | null;
  twoFactor: boolean;
  providers: string[];
  organisations: number;
  secretsCreated: number;
  hasVault: boolean;
};

export const USERS_PAGE = 25;

async function rowsFor(db: Db, users: { id: string; email: string; createdAt: Date; twoFactor: boolean }[]): Promise<UserRow[]> {
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);
  const [accounts, memberships, secrets, vaults, sessions] = await Promise.all([
    db.select({ userId: schema.account.userId, provider: schema.account.providerId }).from(schema.account).where(inArray(schema.account.userId, ids)),
    db.select({ userId: schema.member.userId, n: count() }).from(schema.member).where(inArray(schema.member.userId, ids)).groupBy(schema.member.userId),
    db.select({ userId: schema.secret.createdBy, n: count() }).from(schema.secret).where(inArray(schema.secret.createdBy, ids)).groupBy(schema.secret.createdBy),
    db.select({ userId: schema.vault.userId }).from(schema.vault).where(inArray(schema.vault.userId, ids)),
    db.select({ userId: schema.session.userId, last: max(schema.session.updatedAt) }).from(schema.session).where(inArray(schema.session.userId, ids)).groupBy(schema.session.userId),
  ]);
  const group = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const m = group(memberships);
  const s = group(secrets);
  const v = new Set(vaults.map((r) => r.userId));
  const l = group(sessions);
  return users.map((u) => ({
    id: u.id,
    maskedEmail: maskEmail(u.email),
    joinedAt: u.createdAt.getTime(),
    lastActiveAt: l.get(u.id)?.last ? new Date(l.get(u.id)!.last as unknown as number | Date).getTime() : null,
    twoFactor: u.twoFactor,
    providers: [...new Set(accounts.filter((a) => a.userId === u.id).map((a) => a.provider))].filter((p) => p !== "credential").sort(),
    organisations: Number(m.get(u.id)?.n ?? 0),
    secretsCreated: Number(s.get(u.id)?.n ?? 0),
    hasVault: v.has(u.id),
  }));
}

/** Newest first, 25 to a page, with the total. Emails are masked here, before they leave the data layer. */
export async function listUsers(db: Db, page = 1): Promise<{ rows: UserRow[]; total: number; page: number; pages: number }> {
  const total = Number((await db.select({ n: count() }).from(schema.user))[0]?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const users = await db
    .select({ id: schema.user.id, email: schema.user.email, createdAt: schema.user.createdAt, twoFactor: schema.user.twoFactorEnabled })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt), desc(schema.user.id))
    .limit(USERS_PAGE)
    .offset((p - 1) * USERS_PAGE);
  return { rows: await rowsFor(db, users), total, page: p, pages };
}

/** One person, by the full address typed in. An exact match only: no prefix, no substring, nothing to browse. */
export async function lookupUser(db: Db, email: string): Promise<UserRow | null> {
  const wanted = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wanted)) return null;
  const [u] = await db
    .select({ id: schema.user.id, email: schema.user.email, createdAt: schema.user.createdAt, twoFactor: schema.user.twoFactorEnabled })
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${wanted}`)
    .limit(1);
  return u ? (await rowsFor(db, [u]))[0] : null;
}

/** The one place a full address leaves the data layer for the admin page. The caller logs it. */
export async function revealEmail(db: Db, userId: string): Promise<string | null> {
  const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  return u?.email ?? null;
}
