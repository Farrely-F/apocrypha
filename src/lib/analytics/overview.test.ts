import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "../audit/store";
import * as schema from "../db/schema";
import { createOrganization } from "../workspace/manage";
import { ago, ageBucket, AGE_BUCKETS, buildInsights, categoryOf, DAYS, emptyDays, getDashboardAnalytics } from "./overview";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const cipher = (t: string) => `v1|a256gcm|${"A".repeat(16)}|${t.padEnd(24, "x")}`;
const WRAPPED = "v1|x25519-hkdf-a256gcm|eph|ct";

describe("what counts as what", () => {
  it("sorts events into reading, changing and changing who may", () => {
    for (const t of ["env.read", "share.opened"]) expect(categoryOf(t)).toBe("reads");
    for (const t of ["secret.created", "secret.updated", "secret.deleted", "env.created", "env.deleted", "project.renamed", "org.renamed"]) expect(categoryOf(t)).toBe("changes");
    for (const t of ["member.joined", "member.removed", "member.role_changed", "member.erased", "invite.created", "share.created", "share.revoked", "env.rotated", "account.passphrase_changed"]) {
      expect(categoryOf(t), t).toBe("access");
    }
  });
  it("puts a secret in the freshness bucket for its age, at the edges too", () => {
    expect([0, 29, 30, 89, 90, 179, 180, 4000].map(ageBucket)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(AGE_BUCKETS).toHaveLength(4);
  });
  it("lays out 30 UTC days, oldest first, ending today", () => {
    const d = emptyDays(NOW);
    expect(d).toHaveLength(DAYS);
    expect(d[DAYS - 1].day).toBe("2026-10-22");
    expect(d[0].day).toBe("2026-09-23");
  });
});

describe("how long ago", () => {
  it("is plain and does not round up past what is true", () => {
    const n = NOW;
    expect(ago(n - 20_000, n)).toBe("just now");
    expect(ago(n - 60_000, n)).toBe("1 minute ago");
    expect(ago(n - 59 * 60_000, n)).toBe("59 minutes ago");
    expect(ago(n - 3 * 3_600_000, n)).toBe("3 hours ago");
    expect(ago(n - 30 * 3_600_000, n)).toBe("yesterday");
    expect(ago(n - 9 * DAY, n)).toBe("9 days ago");
    expect(ago(n - 90 * DAY, n)).toBe("3 months ago");
    expect(ago(n + 5000, n)).toBe("just now"); // a clock a little ahead is not "in the future"
  });
});

describe("what is worth saying", () => {
  const org = { id: "o1", name: "Acme", role: "owner" as const, projects: 1, environments: 1, secrets: 3, members: 2, stale: 0, lastActivity: null };
  const ok = { twoFactor: true, sessions: 1, providers: 1 };
  it("is quiet when nothing needs attention", () => {
    expect(buildInsights({ orgs: [org], account: ok, expiringInvites: [], needAccess: [], expiringShares: [] })).toEqual([]);
  });
  it("names the problem, where it is, and where to go, most pressing first", () => {
    const out = buildInsights({
      orgs: [{ ...org, stale: 2 }],
      account: { twoFactor: false, sessions: 3, providers: 1 },
      expiringInvites: [{ orgId: "o1", count: 1 }],
      needAccess: [{ orgId: "o1", count: 2 }],
      expiringShares: [],
    });
    expect(out.map((i) => i.id)).toEqual(["two-factor", "access-o1", "stale", "invite-o1", "sessions"]);
    expect(out.find((i) => i.id === "access-o1")!.text).toContain("2 people need access again in Acme");
    expect(out.find((i) => i.id === "stale")!.href).toBe("/o/o1");
    expect(out.find((i) => i.id === "invite-o1")!.text).toBe("1 invite expires within a day in Acme.");
  });
});

describe("the numbers, from real rows", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let orgId: string;
  const envs: Record<string, string> = {};

  beforeAll(async () => {
    db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-analytics-")), "t.db")}` }), { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    for (const id of ["alice", "bob", "loner"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
    const org = await createOrganization(db, "alice", { name: "Acme", projectName: "App", environment: { id: crypto.randomUUID(), name: "dev", wrappedKey: WRAPPED } });
    if (org.status !== "created") throw new Error("setup");
    orgId = org.orgId;
    envs.dev = org.envId;
    envs.prod = crypto.randomUUID();
    await db.insert(schema.environment).values({ id: envs.prod, projectId: org.projectId, name: "prod" });
    await db.insert(schema.environmentKeyGrant).values({ envId: envs.prod, principalType: "user", principalId: "alice", keyVersion: 1, wrappedKey: WRAPPED });
    await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: "bob", role: "member" });
    // bob can open dev only
    await db.insert(schema.environmentKeyGrant).values({ envId: envs.dev, principalType: "user", principalId: "bob", keyVersion: 1, wrappedKey: WRAPPED });

    const secret = async (env: string, ageDays: number, opts: { deleted?: boolean; history?: boolean } = {}) => {
      const id = crypto.randomUUID();
      await db.insert(schema.secret).values({ id, environmentId: env, createdBy: "alice" });
      const at = (d: number) => new Date(NOW - d * DAY);
      if (opts.history) await db.insert(schema.secretVersion).values({ secretId: id, version: 1, keyVersion: 1, name: cipher("n"), value: cipher("v"), createdBy: "alice", createdAt: at(ageDays + 300) });
      await db.insert(schema.secretVersion).values({ secretId: id, version: opts.history ? 2 : 1, keyVersion: 1, name: cipher("n"), value: cipher("v"), deleted: !!opts.deleted, createdBy: "alice", createdAt: at(ageDays) });
    };
    await secret(envs.dev, 5);
    await secret(envs.dev, 100, { history: true }); // an old version does not make it look old, or count twice
    await secret(envs.dev, 400);
    await secret(envs.dev, 2, { deleted: true }); // deleted: not counted
    await secret(envs.prod, 10);

    await recordAudit(db, { orgId, actorId: "alice", type: "env.read", envId: envs.dev }, NOW - 1_000);
    await recordAudit(db, { orgId, actorId: "alice", type: "secret.updated", envId: envs.dev }, NOW - 3 * DAY);
    await recordAudit(db, { orgId, actorId: "alice", type: "secret.updated", envId: envs.prod }, NOW - 3 * DAY);
    await recordAudit(db, { orgId, actorId: "alice", type: "member.joined", targetUserId: "bob" }, NOW - 5 * DAY);
    await recordAudit(db, { orgId, actorId: "alice", type: "invite.created" }, NOW - 40 * DAY); // outside the window
    // bob's own sessions and an invite about to expire
    await db.insert(schema.invite).values({ id: crypto.randomUUID(), organizationId: orgId, createdBy: "alice", ephemeralPublicKey: "v1|x25519|AAAA", redeemHash: "h", expiresAt: new Date(NOW + 3_600_000) });
    await db.insert(schema.invite).values({ id: crypto.randomUUID(), organizationId: orgId, createdBy: "alice", ephemeralPublicKey: "v1|x25519|AAAA", redeemHash: "h2", expiresAt: new Date(NOW + 3 * DAY) });
  });

  it("an owner sees everything in the organisation", async () => {
    const a = await getDashboardAnalytics(db, "alice", NOW);
    expect(a.orgs).toHaveLength(1);
    expect(a.orgs[0]).toMatchObject({ name: "Acme", role: "owner", projects: 1, environments: 2, secrets: 4, members: 2, stale: 1 });
    expect(a.totals).toEqual({ secrets: 4, environments: 2, members: 2 });
    expect(a.freshness.counts).toEqual([2, 0, 1, 1]); // 5d and 10d; 100d; 400d
    expect(a.freshness.total).toBe(4);
    expect(a.freshness.oldestDays).toBe(400);
  });

  it("counts activity by day and kind inside the window, and leaves older events out", async () => {
    const a = await getDashboardAnalytics(db, "alice", NOW);
    const by = Object.fromEntries(a.activity.days.map((d) => [d.day, d]));
    expect(by["2026-10-22"]).toMatchObject({ reads: 1, changes: 0, access: 0 });
    expect(by["2026-10-19"]).toMatchObject({ changes: 2 });
    expect(by["2026-10-17"]).toMatchObject({ access: 1 });
    expect(a.activity.total).toBe(4); // the event 40 days ago is not in it
    expect(a.activity.partial).toBe(false);
    expect(a.orgs[0].lastActivity).toBeGreaterThan(NOW - 5000);
  });

  it("a member is counted only into what they can open, and sees only what the audit log shows them", async () => {
    const b = await getDashboardAnalytics(db, "bob", NOW);
    expect(b.orgs[0]).toMatchObject({ role: "member", environments: 1, secrets: 3 }); // dev only, not prod
    expect(b.freshness.counts.reduce((x, y) => x + y, 0)).toBe(3);
    // events on prod are not his; the read and update on dev, and the event about him, are
    expect(b.activity.total).toBe(3);
    expect(b.activity.partial).toBe(true);
    expect(b.recent.every((e) => e.envId !== envs.prod)).toBe(true);
  });

  it("tells an owner what needs doing and a member nothing about invites", async () => {
    const a = await getDashboardAnalytics(db, "alice", NOW);
    expect(a.insights.map((i) => i.id)).toEqual(expect.arrayContaining(["two-factor", "stale", `invite-${orgId}`]));
    expect(a.insights.find((i) => i.id === `invite-${orgId}`)!.text).toBe("1 invite expires within a day in Acme."); // the other expires in 3 days
    const b = await getDashboardAnalytics(db, "bob", NOW);
    expect(b.insights.some((i) => i.id.startsWith("invite-"))).toBe(false);
  });

  it("lists the latest events across organisations, newest first, with the organisation named", async () => {
    const a = await getDashboardAnalytics(db, "alice", NOW);
    expect(a.recent.map((e) => e.type)).toEqual(["env.read", "secret.updated", "secret.updated", "member.joined", "invite.created"].slice(0, a.recent.length));
    expect(a.recent[0].orgName).toBe("Acme");
  });

  it("says nothing, and does not fail, for someone with no organisation", async () => {
    const l = await getDashboardAnalytics(db, "loner", NOW);
    expect(l.orgs).toEqual([]);
    expect(l.activity.total).toBe(0);
    expect(l.insights).toEqual([]);
  });
});
