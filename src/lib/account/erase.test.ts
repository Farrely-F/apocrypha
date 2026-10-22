import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "../audit/store";
import { verifyOrgChain } from "../audit/store";
import * as schema from "../db/schema";
import { changeRole } from "../members/store";
import { createVaultRecord } from "../vault/store";
import { createOrganization } from "../workspace/manage";
import { eraseAccount, planErasure } from "./erase";

let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;

// Distinctive on purpose: a leftover shows up as a substring match anywhere in the database.
const ALICE = "u-alice-9f3a71c2";
const EMAIL = "Alice.Under_score@example.com";
const NAME = "Alice Underscore";
const WRAPPED = "v1|x25519-hkdf-a256gcm|eph|ciphertext";
const cipher = (t: string) => `v1|a256gcm|${"A".repeat(16)}|${t.padEnd(24, "x")}`;
const envOf = (name: string) => ({ id: crypto.randomUUID(), name, wrappedKey: WRAPPED });

let personal: { orgId: string; envId: string };
let shared: { orgId: string; envId: string; projectId: string };
let sole: { orgId: string; envId: string };

/** Every row of every table, as text, so "nowhere" can be asserted rather than hoped. */
async function dump() {
  const tables = (await client.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name != '__drizzle_migrations'")).rows.map((r) => String(r.name));
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) out[t] = (await client.execute(`select * from "${t}"`)).rows.map((r) => ({ ...r }));
  return out;
}
const columnsHolding = (d: Awaited<ReturnType<typeof dump>>, needle: string) =>
  new Set(Object.entries(d).flatMap(([t, rows]) => rows.flatMap((r) => Object.entries(r).filter(([, v]) => typeof v === "string" && v.includes(needle)).map(([c]) => `${t}.${c}`))));

beforeAll(async () => {
  client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-erase-")), "t.db")}` });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.user).values([
    { id: ALICE, name: NAME, email: EMAIL },
    { id: "bob", name: "Bob", email: "bob@example.com" },
    { id: "carol", name: "Carol", email: "carol@example.com" },
  ]);
  const vault = (id: string) => ({ userId: id, publicKey: "v1|x25519|AAAA", passphraseBlob: "p", recoveryBlob: "r" });
  await db.insert(schema.vault).values([vault(ALICE), vault("bob"), vault("carol")]);

  // 1. alice's personal organisation: she is alone in it
  const p = await createVaultRecord(db, "carol", {
    publicKey: "v1|x25519|BBBB", passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c", recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: WRAPPED, orgName: "Carol's", projectName: "P", environmentName: "dev" },
  }).catch(() => null);
  void p;
  const mine = await createOrganization(db, ALICE, { name: "Alice alone", projectName: "P", environment: envOf("dev") });
  if (mine.status !== "created") throw new Error("setup");
  personal = { orgId: mine.orgId, envId: mine.envId };

  // 2. a shared organisation: bob owns it, alice and carol are members
  const s = await createOrganization(db, "bob", { name: "Team", projectName: "App", environment: envOf("prod") });
  if (s.status !== "created") throw new Error("setup");
  shared = { orgId: s.orgId, envId: s.envId, projectId: s.projectId };
  await db.insert(schema.member).values([
    { id: crypto.randomUUID(), organizationId: shared.orgId, userId: ALICE, role: "member" },
    { id: crypto.randomUUID(), organizationId: shared.orgId, userId: "carol", role: "admin" },
  ]);
  for (const u of [ALICE, "carol"]) {
    await db.insert(schema.environmentKeyGrant).values({ envId: shared.envId, principalType: "user", principalId: u, keyVersion: 1, wrappedKey: WRAPPED });
  }
  await db.insert(schema.environmentWrite).values({ envId: shared.envId, userId: ALICE });
  await db.insert(schema.regrantRequest).values({ envId: shared.envId, userId: ALICE });
  // a secret alice wrote and one bob wrote, each with a version
  for (const [by, tag] of [[ALICE, "a"], ["bob", "b"]] as const) {
    const id = crypto.randomUUID();
    await db.insert(schema.secret).values({ id, environmentId: shared.envId, createdBy: by });
    await db.insert(schema.secretVersion).values({ secretId: id, version: 1, keyVersion: 1, name: cipher(`n${tag}`), value: cipher(`v${tag}`), createdBy: by });
  }
  // share links and invites: alice's (to be taken down), bob's (kept), one addressed to her email, one she redeemed
  const share = (by: string) => ({ id: crypto.randomUUID(), organizationId: shared.orgId, envId: shared.envId, createdBy: by, envelope: "e", passwordProtected: false, itemCount: 1, maxViews: 5 });
  await db.insert(schema.share).values([share(ALICE), share("bob")]);
  const invite = (over: Partial<typeof schema.invite.$inferInsert>) => ({ id: crypto.randomUUID(), organizationId: shared.orgId, createdBy: "bob", ephemeralPublicKey: "v1|x25519|AAAA", redeemHash: "h", expiresAt: new Date(Date.now() + 1e6), ...over });
  await db.insert(schema.invite).values([
    invite({ createdBy: ALICE }),
    invite({ email: EMAIL.toLowerCase() }),
    invite({ email: EMAIL, usedAt: new Date(), usedBy: ALICE }),
    invite({ email: "someone@else.com" }),
  ]);
  await recordAudit(db, { orgId: shared.orgId, actorId: ALICE, type: "secret.created", envId: shared.envId });
  await recordAudit(db, { orgId: shared.orgId, actorId: "bob", type: "member.role_changed", targetUserId: ALICE });
  await recordAudit(db, { orgId: shared.orgId, actorId: "bob", type: "secret.updated", envId: shared.envId });

  // 3. an organisation alice solely owns, with bob in it
  const t = await createOrganization(db, ALICE, { name: "Sole owner", projectName: "P", environment: envOf("dev") });
  if (t.status !== "created") throw new Error("setup");
  sole = { orgId: t.orgId, envId: t.envId };
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: sole.orgId, userId: "bob", role: "member" });

  // her sign-in leftovers
  await db.insert(schema.session).values({ id: "s1", token: "tok", userId: ALICE, expiresAt: new Date(Date.now() + 1e6), ipAddress: "203.0.113.9", userAgent: "UA" });
  await db.insert(schema.account).values({ id: "a1", accountId: "gh-1", providerId: "github", userId: ALICE, accessToken: "secret-token" });
  await db.insert(schema.twoFactor).values({ id: "t1", secret: "enc", backupCodes: "enc", userId: ALICE });
  await db.insert(schema.auditEnvRead).values({ sessionId: "s1", envId: shared.envId });
  const exp = new Date(Date.now() + 1e6);
  await db.insert(schema.verification).values([
    { id: "v1", identifier: EMAIL.toLowerCase(), value: "magic-link-token", expiresAt: exp },
    { id: "v2", identifier: "2fa-abc", value: ALICE, expiresAt: exp },
    { id: "v3", identifier: "2fa-attempts-2fa-abc", value: "0", expiresAt: exp },
    { id: "v4", identifier: "oauth-state", value: JSON.stringify({ link: { userId: ALICE, email: EMAIL } }), expiresAt: exp },
    { id: "v5", identifier: "someone-else", value: "keep-me", expiresAt: exp },
  ]);
  await db.insert(schema.rateLimit).values([
    { key: `passphrase:${ALICE}`, window: 1, count: 3, expiresAt: Date.now() + 1e6 },
    { key: "passphrase:bob", window: 1, count: 1, expiresAt: Date.now() + 1e6 },
  ]);
});

describe("account erasure", () => {
  it("plans each organisation: alone, shared, or sole owner with a team", async () => {
    const plan = await planErasure(db, ALICE);
    const by = Object.fromEntries(plan.orgs.map((o) => [o.name, o.action]));
    expect(by).toEqual({ "Alice alone": "delete", Team: "leave", "Sole owner": "blocked" });
    expect(plan.blocked.map((o) => [o.name, o.members])).toEqual([["Sole owner", 2]]);
  });

  it("changes nothing at all while she is the only owner of an organisation with a team", async () => {
    const before = JSON.stringify(await dump());
    const r = await eraseAccount(db, ALICE);
    expect(r.status).toBe("blocked");
    expect(JSON.stringify(await dump())).toBe(before);
  });

  it("goes through once someone else is an owner, and leaves no trace of her", async () => {
    expect(await changeRole(db, ALICE, sole.orgId, "bob", "owner")).toBe("ok");
    const teamBefore = await db.select().from(schema.secretVersion);
    const bobGrant = await db.select().from(schema.environmentKeyGrant).where(eq(schema.environmentKeyGrant.principalId, "bob"));

    const r = await eraseAccount(db, ALICE);
    expect(r).toMatchObject({ status: "erased" });
    if (r.status !== "erased") return;
    expect(r.deleted).toEqual([personal.orgId]);
    expect(r.left.sort()).toEqual([shared.orgId, sole.orgId].sort());

    const d = await dump();
    const text = JSON.stringify(d);
    // her email and name are nowhere, in any case
    expect(text.toLowerCase()).not.toContain(EMAIL.toLowerCase());
    expect(text).not.toContain(NAME);
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("secret-token");
    // her id survives only as an opaque reference in rows that belong to organisations that continue
    expect([...columnsHolding(d, ALICE)].sort()).toEqual(
      ["audit_event.actor_id", "audit_event.target_user_id", "invite.used_by", "secret.created_by", "secret_version.created_by"].sort(),
    );
    // her organisation, and everything in it, is gone
    expect(d.organization.map((o) => o.id)).not.toContain(personal.orgId);
    expect(JSON.stringify(d.environment)).not.toContain(personal.envId);
    // what she held or made that carried keys is gone; other people's is not
    expect(d.share.map((s) => s.created_by)).toEqual(["bob"]);
    expect(d.invite.every((i) => i.created_by !== ALICE || i.used_by === ALICE)).toBe(true);
    expect(d.invite.find((i) => i.email === "someone@else.com")).toBeTruthy();
    expect(d.invite.filter((i) => i.email === null && i.used_by === ALICE)).toHaveLength(1);
    expect(d.verification.map((v) => v.id)).toEqual(["v5"]);
    expect(d.rate_limit.map((r) => r.key)).toEqual(["passphrase:bob"]);
    expect(d.environment_key_grant.some((g) => g.principal_id === ALICE)).toBe(false);
    // the team keeps its data, untouched
    expect(await db.select().from(schema.secretVersion)).toEqual(teamBefore.filter((v) => v.secretId));
    expect(await db.select().from(schema.environmentKeyGrant).where(eq(schema.environmentKeyGrant.principalId, "bob"))).toEqual(bobGrant);
    expect((await db.select().from(schema.member).where(eq(schema.member.organizationId, shared.orgId))).map((m) => m.userId).sort()).toEqual(["bob", "carol"]);
    // and the shared organisation's audit chain still verifies, with her events kept
    expect(await verifyOrgChain(db, shared.orgId)).toMatchObject({ ok: true });
    expect(d.audit_event.filter((e) => e.organization_id === shared.orgId)).toHaveLength(3);
  });

  it("is a no-op for an account that is already gone", async () => {
    expect(await eraseAccount(db, ALICE)).toEqual({ status: "not-found" });
  });

  it("re-checks ownership at the moment of erasing: a co-owner leaving first blocks the last one", async () => {
    await db.insert(schema.user).values([{ id: "o1", name: "o1", email: "o1@example.com" }, { id: "o2", name: "o2", email: "o2@example.com" }]);
    const org = await createOrganization(db, "o1", { name: "Pair", projectName: "P", environment: envOf("dev") });
    if (org.status !== "created") throw new Error("setup");
    await db.insert(schema.member).values([
      { id: crypto.randomUUID(), organizationId: org.orgId, userId: "o2", role: "owner" },
      { id: crypto.randomUUID(), organizationId: org.orgId, userId: "carol", role: "member" },
    ]);
    // both previewed "leave", then the other owner erases first
    expect((await planErasure(db, "o1")).orgs[0].action).toBe("leave");
    expect((await eraseAccount(db, "o2")).status).toBe("erased");
    const second = await eraseAccount(db, "o1");
    expect(second.status).toBe("blocked");
    expect((await db.select().from(schema.user).where(eq(schema.user.id, "o1"))).length).toBe(1);
  });
});
