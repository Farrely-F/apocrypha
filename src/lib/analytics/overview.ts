import { and, eq, gt, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { auditScope, listAudit, type AuditRow } from "../audit/store";
import * as schema from "../db/schema";
import { BUILDERS } from "../workspace/roles";
import { listWorkspaceTree } from "../workspace/manage";

type Db = LibSQLDatabase<typeof schema>;

/**
 * What the dashboard can say about a person's workspaces without decrypting anything: counts, dates and who did
 * what, all from rows the server already holds. Nothing new is collected for it, nothing leaves the server, and
 * it follows the same visibility rules as the rest of the app: you are counted only into environments whose key
 * you hold, and the activity is the audit log you are allowed to read.
 */
export const DAYS = 30;
const DAY_MS = 86_400_000;

export type Category = "changes" | "reads" | "access";

/** Reading something, changing something, or changing who may. */
export function categoryOf(type: string): Category {
  if (type === "env.read" || type === "share.opened") return "reads";
  if (/^(secret|project|env|org)\./.test(type) && type !== "env.rotated") return "changes";
  return "access";
}

export type DayBucket = { day: string; changes: number; reads: number; access: number };

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `DAYS` UTC days, oldest first, ending with today. */
export function emptyDays(now: number): DayBucket[] {
  const start = Date.parse(dayKey(now)) - (DAYS - 1) * DAY_MS;
  return Array.from({ length: DAYS }, (_, i) => ({ day: dayKey(start + i * DAY_MS), changes: 0, reads: 0, access: 0 }));
}

export const AGE_BUCKETS = [
  { key: "fresh", label: "Under 30 days", below: 30 },
  { key: "recent", label: "30 to 90 days", below: 90 },
  { key: "aging", label: "90 to 180 days", below: 180 },
  { key: "stale", label: "Over 180 days", below: Infinity },
] as const;

/** Which freshness bucket a secret that last changed `ageDays` ago belongs to. */
export function ageBucket(ageDays: number): number {
  return AGE_BUCKETS.findIndex((b) => ageDays < b.below);
}

export type OrgStat = {
  id: string;
  name: string;
  role: schema.OrgRole;
  projects: number;
  environments: number;
  secrets: number;
  members: number;
  stale: number;
  lastActivity: number | null;
};

export type Insight = { id: string; tone: "attention" | "info"; text: string; href: string };

export type RecentEvent = AuditRow & { orgName: string };

export type Analytics = {
  generatedAt: number;
  orgs: OrgStat[];
  totals: { secrets: number; environments: number; members: number };
  activity: { days: DayBucket[]; total: number; partial: boolean };
  freshness: { counts: number[]; total: number; oldestDays: number | null };
  recent: RecentEvent[];
  account: { twoFactor: boolean; sessions: number; providers: number };
  insights: Insight[];
};

type InsightInput = {
  orgs: OrgStat[];
  account: Analytics["account"];
  expiringInvites: { orgId: string; count: number }[];
  needAccess: { orgId: string; count: number }[];
  expiringShares: { orgId: string; count: number }[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The few things worth a person's attention, most pressing first. Each says where to go. */
export function buildInsights({ orgs, account, expiringInvites, needAccess, expiringShares }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? "an organisation";
  if (!account.twoFactor) out.push({ id: "two-factor", tone: "attention", text: "Two-step sign-in is off. A stolen GitHub or Google session would be enough to reach your vault's encrypted data.", href: "/settings" });
  for (const n of needAccess) {
    out.push({ id: `access-${n.orgId}`, tone: "attention", text: `${plural(n.count, "person needs", "people need")} access again in ${name(n.orgId)} after resetting their vault.`, href: `/o/${n.orgId}/settings` });
  }
  const stale = orgs.filter((o) => o.stale > 0).sort((a, b) => b.stale - a.stale);
  if (stale.length) {
    const total = stale.reduce((n, o) => n + o.stale, 0);
    out.push({ id: "stale", tone: "attention", text: `${plural(total, "secret hasn't", "secrets haven't")} changed in over 180 days${stale.length > 1 ? "" : ` (${stale[0].name})`}. Worth rotating at the source.`, href: `/o/${stale[0].id}` });
  }
  for (const n of expiringInvites) {
    out.push({ id: `invite-${n.orgId}`, tone: "info", text: `${plural(n.count, "invite expires", "invites expire")} within a day in ${name(n.orgId)}.`, href: `/o/${n.orgId}/settings` });
  }
  for (const n of expiringShares) {
    out.push({ id: `share-${n.orgId}`, tone: "info", text: `${plural(n.count, "share link expires", "share links expire")} within a week in ${name(n.orgId)}.`, href: `/o/${n.orgId}/settings` });
  }
  if (account.sessions > 1) out.push({ id: "sessions", tone: "info", text: `You are signed in on ${account.sessions} devices.`, href: "/settings" });
  return out;
}

const SOON_INVITE = DAY_MS;
const SOON_SHARE = 7 * DAY_MS;

export async function getDashboardAnalytics(db: Db, userId: string, now = Date.now()): Promise<Analytics> {
  const tree = await listWorkspaceTree(db, userId);
  const orgIds = tree.map((o) => o.id);
  const empty: Analytics = {
    generatedAt: now,
    orgs: [],
    totals: { secrets: 0, environments: 0, members: 0 },
    activity: { days: emptyDays(now), total: 0, partial: false },
    freshness: { counts: AGE_BUCKETS.map(() => 0), total: 0, oldestDays: null },
    recent: [],
    account: { twoFactor: false, sessions: 0, providers: 0 },
    insights: [],
  };
  if (orgIds.length === 0) return empty;

  // Environments the person holds a key for: the only ones counted, as in the workspace tree.
  const envOrg = new Map<string, string>();
  for (const o of tree) for (const p of o.projects) for (const e of p.environments) envOrg.set(e.id, o.id);
  const envIds = [...envOrg.keys()];

  const memberRows = await db
    .select({ orgId: schema.member.organizationId, n: sql<number>`count(*)` })
    .from(schema.member)
    .where(inArray(schema.member.organizationId, orgIds))
    .groupBy(schema.member.organizationId);
  const members = new Map(memberRows.map((r) => [r.orgId, Number(r.n)]));

  // The newest version of each live secret in those environments, and when it last changed.
  const secretStats = new Map<string, { secrets: number; stale: number }>();
  const freshness = AGE_BUCKETS.map(() => 0);
  let oldestDays: number | null = null;
  if (envIds.length) {
    const latest = db
      .select({ secretId: schema.secretVersion.secretId, v: max(schema.secretVersion.version).as("v") })
      .from(schema.secretVersion)
      .groupBy(schema.secretVersion.secretId)
      .as("latest");
    const live = await db
      .select({ envId: schema.secret.environmentId, changedAt: schema.secretVersion.createdAt })
      .from(schema.secret)
      .innerJoin(latest, eq(latest.secretId, schema.secret.id))
      .innerJoin(schema.secretVersion, and(eq(schema.secretVersion.secretId, latest.secretId), eq(schema.secretVersion.version, latest.v)))
      .where(and(inArray(schema.secret.environmentId, envIds), eq(schema.secretVersion.deleted, false)));
    for (const r of live) {
      const orgId = envOrg.get(r.envId)!;
      const age = Math.max(0, Math.floor((now - r.changedAt.getTime()) / DAY_MS));
      const b = ageBucket(age);
      freshness[b]++;
      oldestDays = oldestDays === null ? age : Math.max(oldestDays, age);
      const s = secretStats.get(orgId) ?? { secrets: 0, stale: 0 };
      s.secrets++;
      if (b === AGE_BUCKETS.length - 1) s.stale++;
      secretStats.set(orgId, s);
    }
  }

  // Activity: the audit log this person may read, counted by UTC day and kind.
  const days = emptyDays(now);
  const since = Date.parse(days[0].day);
  const index = new Map(days.map((d, i) => [d.day, i]));
  let activityTotal = 0;
  let partial = false;
  const lastActivity = new Map<string, number>();
  for (const orgId of orgIds) {
    const visible = await auditScope(db, userId, orgId);
    if (!visible) continue;
    if (!visible.full) partial = true;
    const rows = await db
      .select({ day: sql<string>`strftime('%Y-%m-%d', ${schema.auditEvent.createdAt} / 1000, 'unixepoch')`, type: schema.auditEvent.type, n: sql<number>`count(*)`, last: sql<number>`max(${schema.auditEvent.createdAt})` })
      .from(schema.auditEvent)
      .where(and(eq(schema.auditEvent.organizationId, orgId), sql`${schema.auditEvent.createdAt} >= ${since}`, visible.where))
      .groupBy(sql`1`, schema.auditEvent.type);
    for (const r of rows) {
      const i = index.get(r.day);
      if (i === undefined) continue;
      days[i][categoryOf(r.type)] += Number(r.n);
      activityTotal += Number(r.n);
      lastActivity.set(orgId, Math.max(lastActivity.get(orgId) ?? 0, Number(r.last)));
    }
  }

  const recent: RecentEvent[] = [];
  for (const o of tree) {
    const log = await listAudit(db, userId, o.id, { limit: 8 });
    if (log) recent.push(...log.events.map((e) => ({ ...e, orgName: o.name })));
  }
  recent.sort((a, b) => b.createdAt - a.createdAt);

  // What owners and admins are expected to look after: invites, shares and people waiting to be re-granted.
  const builderOrgs = tree.filter((o) => BUILDERS.includes(o.role)).map((o) => o.id);
  const expiringInvites: InsightInput["expiringInvites"] = [];
  const expiringShares: InsightInput["expiringShares"] = [];
  const needAccess: InsightInput["needAccess"] = [];
  if (builderOrgs.length) {
    const inv = await db
      .select({ orgId: schema.invite.organizationId, n: sql<number>`count(*)` })
      .from(schema.invite)
      .where(and(inArray(schema.invite.organizationId, builderOrgs), isNull(schema.invite.usedAt), isNull(schema.invite.revokedAt), gt(schema.invite.expiresAt, new Date(now)), lte(schema.invite.expiresAt, new Date(now + SOON_INVITE))))
      .groupBy(schema.invite.organizationId);
    for (const r of inv) expiringInvites.push({ orgId: r.orgId, count: Number(r.n) });

    const shr = await db
      .select({ orgId: schema.share.organizationId, n: sql<number>`count(*)` })
      .from(schema.share)
      .where(and(inArray(schema.share.organizationId, builderOrgs), isNull(schema.share.revokedAt), gt(schema.share.expiresAt, new Date(now)), lte(schema.share.expiresAt, new Date(now + SOON_SHARE)), or(isNull(schema.share.maxViews), sql`${schema.share.views} < ${schema.share.maxViews}`)))
      .groupBy(schema.share.organizationId);
    for (const r of shr) expiringShares.push({ orgId: r.orgId, count: Number(r.n) });

    const need = await db
      .select({ orgId: schema.project.organizationId, n: sql<number>`count(distinct ${schema.regrantRequest.userId})` })
      .from(schema.regrantRequest)
      .innerJoin(schema.environment, eq(schema.environment.id, schema.regrantRequest.envId))
      .innerJoin(schema.project, eq(schema.project.id, schema.environment.projectId))
      .where(inArray(schema.project.organizationId, builderOrgs))
      .groupBy(schema.project.organizationId);
    for (const r of need) needAccess.push({ orgId: r.orgId, count: Number(r.n) });
  }

  const [u] = await db.select({ twoFactor: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  const [sessionRow] = await db.select({ n: sql<number>`count(*)` }).from(schema.session).where(and(eq(schema.session.userId, userId), gt(schema.session.expiresAt, new Date(now))));
  const [providerRow] = await db.select({ n: sql<number>`count(*)` }).from(schema.account).where(and(eq(schema.account.userId, userId), sql`${schema.account.providerId} != 'credential'`));
  const account = { twoFactor: Boolean(u?.twoFactor), sessions: Number(sessionRow?.n ?? 0), providers: Number(providerRow?.n ?? 0) };

  const orgs: OrgStat[] = tree.map((o) => ({
    id: o.id,
    name: o.name,
    role: o.role,
    projects: o.projects.length,
    environments: o.projects.reduce((n, p) => n + p.environments.length, 0),
    secrets: secretStats.get(o.id)?.secrets ?? 0,
    members: members.get(o.id) ?? 0,
    stale: secretStats.get(o.id)?.stale ?? 0,
    lastActivity: lastActivity.get(o.id) ?? null,
  }));

  return {
    generatedAt: now,
    orgs,
    totals: { secrets: orgs.reduce((n, o) => n + o.secrets, 0), environments: orgs.reduce((n, o) => n + o.environments, 0), members: orgs.reduce((n, o) => n + o.members, 0) },
    activity: { days, total: activityTotal, partial },
    freshness: { counts: freshness, total: freshness.reduce((a, b) => a + b, 0), oldestDays },
    recent: recent.slice(0, 8),
    account,
    insights: buildInsights({ orgs, account, expiringInvites, needAccess, expiringShares }),
  };
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago", "2 months ago": plain, and the same on server and client. */
export function ago(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 60) return `${d} days ago`;
  const mo = Math.floor(d / 30);
  return `${mo} months ago`;
}
