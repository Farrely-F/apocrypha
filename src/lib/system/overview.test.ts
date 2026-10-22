import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "../audit/store";
import * as schema from "../db/schema";
import { createOrganization } from "../workspace/manage";
import { checkAuditChains, checkHealth, computeSystemOverview, EXPECTED_MIGRATIONS, listUsers, lookupUser, revealEmail, USERS_PAGE } from "./overview";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const cipher = (t: string) => `v1|a256gcm|${"A".repeat(16)}|${t.padEnd(24, "x")}`;
const WRAPPED = "v1|x25519-hkdf-a256gcm|eph|ct";

let db: ReturnType<typeof drizzle<typeof schema>>;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-system-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  const at = (d: number) => new Date(NOW - d * DAY);
  await db.insert(schema.user).values([
    { id: "alice-id-0001", name: "Alice Anderson", email: "alice@gmail.com", twoFactorEnabled: true, createdAt: at(40) },
    { id: "bob-id-000002", name: "Bob", email: "Bob.Builder@example.org", createdAt: at(5) },
    { id: "carol-id-0003", name: "Carol", email: "carol@corp.example", createdAt: at(0) },
  ]);
  await db.insert(schema.account).values([
    { id: "a1", accountId: "g1", providerId: "github", userId: "alice-id-0001" },
    { id: "a2", accountId: "g2", providerId: "google", userId: "alice-id-0001" },
    { id: "a3", accountId: "g3", providerId: "credential", userId: "bob-id-000002" },
    { id: "a4", accountId: "g4", providerId: "github", userId: "carol-id-0003" },
  ]);
  await db.insert(schema.vault).values({ userId: "alice-id-0001", publicKey: "v1|x25519|AAAA", passphraseBlob: "p", recoveryBlob: "r" });
  await db.insert(schema.session).values([
    { id: "s1", token: "t1", userId: "alice-id-0001", expiresAt: new Date(NOW + DAY), createdAt: at(1), updatedAt: new Date(NOW - 3_600_000) },
    { id: "s2", token: "t2", userId: "bob-id-000002", expiresAt: new Date(NOW + DAY), createdAt: at(10), updatedAt: at(5) },
    { id: "s3", token: "t3", userId: "carol-id-0003", expiresAt: new Date(NOW + DAY), createdAt: at(60), updatedAt: at(40) },
  ]);
  const a = await createOrganization(db, "alice-id-0001", { name: "Acme Secret Plans", projectName: "Hidden Project", environment: { id: crypto.randomUUID(), name: "prod", wrappedKey: WRAPPED } });
  const b = await createOrganization(db, "bob-id-000002", { name: "Bobco", projectName: "P", environment: { id: crypto.randomUUID(), name: "dev", wrappedKey: WRAPPED } });
  if (a.status !== "created" || b.status !== "created") throw new Error("setup");
  orgA = a.orgId;
  orgB = b.orgId;
  for (const [env, by] of [[a.envId, "alice-id-0001"], [a.envId, "alice-id-0001"], [b.envId, "bob-id-000002"]] as const) {
    const id = crypto.randomUUID();
    await db.insert(schema.secret).values({ id, environmentId: env, createdBy: by });
    await db.insert(schema.secretVersion).values({ secretId: id, version: 1, keyVersion: 1, name: cipher("n"), value: cipher("v"), createdBy: by });
  }
  const gone = crypto.randomUUID();
  await db.insert(schema.secret).values({ id: gone, environmentId: a.envId, createdBy: "alice-id-0001" });
  await db.insert(schema.secretVersion).values({ secretId: gone, version: 1, keyVersion: 1, name: cipher("n"), value: cipher("v"), createdBy: "alice-id-0001" });
  await db.insert(schema.secretVersion).values({ secretId: gone, version: 2, keyVersion: 1, name: cipher("n"), value: cipher("v"), deleted: true, createdBy: "alice-id-0001" });
  await recordAudit(db, { orgId: orgA, actorId: "alice-id-0001", type: "env.read", envId: a.envId }, NOW - 1000);
  await recordAudit(db, { orgId: orgA, actorId: "alice-id-0001", type: "secret.updated", envId: a.envId }, NOW - 2 * DAY);
  await recordAudit(db, { orgId: orgB, actorId: "bob-id-000002", type: "member.joined" }, NOW - 3 * DAY);
  await recordAudit(db, { orgId: orgB, actorId: "bob-id-000002", type: "org.created" }, NOW - 50 * DAY); // outside the window
  await db.insert(schema.invite).values({ id: crypto.randomUUID(), organizationId: orgA, createdBy: "alice-id-0001", ephemeralPublicKey: "v1|x25519|AAAA", redeemHash: "h", expiresAt: new Date(NOW + DAY) });
});

describe("the system-wide numbers", () => {
  it("counts people, organisations and live secrets across everyone", async () => {
    const o = await computeSystemOverview(db, NOW);
    expect(o.totals).toMatchObject({ users: 3, vaults: 1, organisations: 2, projects: 2, environments: 2, secrets: 3, memberships: 2 }); // the deleted secret is not counted
    expect(o.twoFactor).toEqual({ enabled: 1, users: 3 });
    expect(Object.fromEntries(o.providers.map((p) => [p.provider, p.accounts]))).toEqual({ github: 2, google: 1, credential: 1 });
  });

  it("counts sign-ups per day and who was active in the last day, week and month", async () => {
    const o = await computeSystemOverview(db, NOW);
    expect(o.signups.days).toHaveLength(30);
    expect(o.signups.days.at(-1)).toEqual({ day: "2026-10-22", n: 1 }); // carol, today
    expect(o.signups.total).toBe(2); // alice joined 40 days ago, outside the window
    expect(o.active).toEqual({ day: 1, week: 2, month: 2 }); // alice an hour ago; bob 5 days ago; carol 40 days ago
  });

  it("counts audit activity by kind inside the window, system-wide, with no content", async () => {
    const o = await computeSystemOverview(db, NOW);
    expect(o.activity.total).toBe(3);
    const by = Object.fromEntries(o.activity.days.map((d) => [d.day, d]));
    expect(by["2026-10-22"]).toMatchObject({ reads: 1 });
    expect(by["2026-10-20"]).toMatchObject({ changes: 1 });
    expect(by["2026-10-19"]).toMatchObject({ access: 1 });
  });

  it("counts what is in flight, lists table sizes biggest first, and reports the database size", async () => {
    const o = await computeSystemOverview(db, NOW);
    expect(o.inFlight).toMatchObject({ pendingInvites: 1, activeShares: 0, peopleWaitingForAccess: 0 });
    const rows = o.tables.map((t) => t.rows);
    expect([...rows].sort((a, b) => b - a)).toEqual(rows);
    expect(o.tables.find((t) => t.name === "secret_version")!.rows).toBe(5); // 3 secrets, plus one that was written and then deleted
    expect(o.dbBytes).toBeGreaterThan(0);
  });

  it("holds no name, email or workspace name anywhere in what it returns", async () => {
    const text = JSON.stringify(await computeSystemOverview(db, NOW));
    for (const leak of ["alice@gmail.com", "Alice", "Bob.Builder", "carol@corp", "Acme Secret Plans", "Hidden Project", "Bobco"]) expect(text, leak).not.toContain(leak);
  });
});

describe("the user list: minimal, masked, and exact to find", () => {
  it("lists newest first with only the monitoring fields, and masks every address", async () => {
    const l = await listUsers(db);
    expect(l.total).toBe(3);
    expect(l.rows.map((r) => r.maskedEmail)).toEqual(["c•••••@corp.example", "B•••••@example.org", "a•••••@gmail.com"]);
    const alice = l.rows.find((r) => r.id === "alice-id-0001")!;
    expect(alice).toMatchObject({ twoFactor: true, providers: ["github", "google"], organisations: 1, secretsCreated: 3, hasVault: true });
    expect(l.rows.find((r) => r.id === "bob-id-000002")).toMatchObject({ providers: [], hasVault: false }); // a password account is not a provider
    const text = JSON.stringify(l);
    for (const leak of ["alice@gmail", "Builder", "carol@", "Alice Anderson", "Acme", "tokens", "ip"]) expect(text, leak).not.toContain(leak);
    expect(Object.keys(alice).sort()).toEqual(["hasVault", "id", "joinedAt", "lastActiveAt", "maskedEmail", "organisations", "providers", "secretsCreated", "twoFactor"]);
  });

  it("clamps the page and keeps a page small", async () => {
    expect((await listUsers(db, 99)).page).toBe(1);
    expect((await listUsers(db, -3)).page).toBe(1);
    expect((await listUsers(db, Number.NaN)).page).toBe(1);
    expect(USERS_PAGE).toBe(25);
  });

  it("finds one person by their full address, case aside, and nothing by a piece of one", async () => {
    expect((await lookupUser(db, "ALICE@gmail.com"))!.id).toBe("alice-id-0001");
    expect((await lookupUser(db, "  bob.builder@example.org "))!.id).toBe("bob-id-000002");
    for (const piece of ["alice", "alice@", "@gmail.com", "gmail", "a", "alice@gmail", "%@%", "alice@gmail.co", "alic_@gmail.com", "%"]) {
      expect(await lookupUser(db, piece), piece).toBeNull();
    }
    expect(await lookupUser(db, "nobody@example.com")).toBeNull();
  });

  it("returns a full address only through the reveal function", async () => {
    expect(await revealEmail(db, "alice-id-0001")).toBe("alice@gmail.com");
    expect(await revealEmail(db, "nope-nope-nope")).toBeNull();
  });
});

describe("health", () => {
  it("reports the database answering, the migrations in step, and where it is running", async () => {
    const h = await checkHealth(db, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "0123456789abcdef", VERCEL_REGION: "fra1" }, NOW);
    expect(h.database.ok).toBe(true);
    expect(h.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(h.migrations).toEqual({ applied: EXPECTED_MIGRATIONS, expected: EXPECTED_MIGRATIONS, state: "ok" });
    expect(h.build).toMatchObject({ environment: "production", commit: "0123456", region: "fra1" });
  });

  it("says pending when the database is behind the code", async () => {
    const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-behind-")), "t.db")}` });
    const behind = drizzle(client, { schema });
    await migrate(behind, { migrationsFolder: "drizzle" });
    await client.execute("delete from __drizzle_migrations where rowid = (select max(rowid) from __drizzle_migrations)");
    expect((await checkHealth(behind)).migrations.state).toBe("pending");
  });
});

describe("the audit chain check", () => {
  it("passes for intact chains, and says how much it looked at", async () => {
    const r = await checkAuditChains(db);
    expect(r).toMatchObject({ checkedOrgs: 2, ok: 2, events: 4, broken: [] });
    expect(r.limits).toEqual({ orgs: 25, events: 5000 });
  });

  it("finds an edited row, and names the organisation by its opaque id only", async () => {
    await db.update(schema.auditEvent).set({ type: "secret.deleted" }).where(eq(schema.auditEvent.organizationId, orgA));
    const r = await checkAuditChains(db);
    expect(r.ok).toBe(1);
    expect(r.broken).toHaveLength(1);
    expect(r.broken[0]).toMatchObject({ orgId: orgA, reason: "contents were changed" });
    expect(JSON.stringify(r)).not.toContain("Acme");
  });

  it("looks at a bounded number of organisations and events, however many there are", async () => {
    const r = await checkAuditChains(db, { orgs: 1, events: 1 });
    expect(r.checkedOrgs).toBe(1);
    expect(r.events).toBe(1);
  });
});

import { expireOverview, getSystemOverview, OVERVIEW_TTL_MS } from "./cached";

describe("the saved copy of the numbers", () => {
  it("is reused for five minutes, then counted again, and refreshing forgets it on the spot", async () => {
    const t0 = NOW + 10 * DAY;
    const first = await getSystemOverview(db, t0);
    await db.insert(schema.user).values({ id: "late-arrival-01", name: "Late", email: "late@example.com", createdAt: new Date(t0) });
    expect((await getSystemOverview(db, t0 + 60_000)).totals.users).toBe(first.totals.users); // still the saved copy
    expect((await getSystemOverview(db, t0 + OVERVIEW_TTL_MS + 1)).totals.users).toBe(first.totals.users + 1); // expired: counted again
    await db.insert(schema.user).values({ id: "later-arrival-02", name: "Later", email: "later@example.com", createdAt: new Date(t0) });
    expect((await getSystemOverview(db, t0 + OVERVIEW_TTL_MS + 60_000)).totals.users).toBe(first.totals.users + 1);
    await expireOverview(db);
    expect((await getSystemOverview(db, t0 + OVERVIEW_TTL_MS + 61_000)).totals.users).toBe(first.totals.users + 2);
  });

  it("is a row in the database, so another instance sees the same copy, and holds only counts", async () => {
    await getSystemOverview(db, NOW + 20 * DAY);
    const rows = await db.select().from(schema.systemSnapshot);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("overview");
    for (const leak of ["@", "Alice", "Acme Secret Plans", "Hidden Project", "Bobco"]) expect(rows[0].payload, leak).not.toContain(leak);
  });

  it("counts again when the saved copy is damaged or dated in the future", async () => {
    await db.update(schema.systemSnapshot).set({ payload: "{not json" });
    expect((await getSystemOverview(db, NOW + 20 * DAY + 1000)).totals.users).toBeGreaterThan(0);
    await db.update(schema.systemSnapshot).set({ computedAt: NOW + 99 * DAY });
    const now = NOW + 20 * DAY + 2000;
    await getSystemOverview(db, now);
    expect((await db.select().from(schema.systemSnapshot))[0].computedAt).toBe(now);
  });
});
