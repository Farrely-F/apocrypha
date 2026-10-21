import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createVaultRecord } from "../vault/store";
import { createEnvironment } from "../workspace/manage";
import type { WorkspaceIds } from "../workspace/shared";
import { createInvite, getInviteOffer, INVITE_TTL_MS, listPendingInvites, redeemInvite, revokeInvite } from "./store";

let db: ReturnType<typeof drizzle<typeof schema>>;
let ws: WorkspaceIds;
const w = (t: string) => `v1|x25519-hkdf-a256gcm|eph|${t}`;
const people = { carol: { id: "carol", email: "carol@example.com", emailVerified: true }, erin: { id: "erin", email: "erin@example.com", emailVerified: false } };
const mk = async (grants = [{ envId: ws.envId, wrappedKey: w("inv") }], email: string | null = null) => {
  const r = await createInvite(db, "alice", { orgId: ws.orgId, email, ephemeralPublicKey: "v1|x25519|AAAA", grants });
  if (r.status !== "created") throw new Error(r.status);
  return r.inviteId;
};

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-inv-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "dave", "carol", "erin"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, "alice", {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: w("first"), orgName: "Org", projectName: "P", environmentName: "dev" },
  });
  if (r.status !== "created") throw new Error("setup");
  ws = { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: ws.orgId, userId: "dave", role: "member" });
});

describe("creating invites", () => {
  it("only owners and admins, only for environments of this org that they hold", async () => {
    const g = [{ envId: ws.envId, wrappedKey: w("x") }];
    const mkFor = (u: string, grants = g) => createInvite(db, u, { orgId: ws.orgId, email: null, ephemeralPublicKey: "v1|x25519|AAAA", grants });
    expect((await mkFor("dave")).status).toBe("forbidden");
    expect((await mkFor("bob")).status).toBe("not-found");
    expect((await mkFor("alice", [])).status).toBe("bad-environments");
    expect((await mkFor("alice", [{ envId: crypto.randomUUID(), wrappedKey: w("y") }])).status).toBe("bad-environments");
    // an admin who holds no key for an environment cannot hand it out
    await db.update(schema.member).set({ role: "admin" }).where(and(eq(schema.member.userId, "dave"), eq(schema.member.organizationId, ws.orgId)));
    expect((await mkFor("dave")).status).toBe("bad-environments");
    await db.update(schema.member).set({ role: "member" }).where(and(eq(schema.member.userId, "dave"), eq(schema.member.organizationId, ws.orgId)));
    expect((await mkFor("alice")).status).toBe("created");
  });
});

describe("redeeming invites", () => {
  it("joins as a member with exactly the invited environments, once", async () => {
    const id = await mk();
    const r = await redeemInvite(db, people.carol, id, [{ envId: ws.envId, wrappedKey: w("carol") }]);
    expect(r).toMatchObject({ status: "joined", orgId: ws.orgId });
    const [m] = await db.select().from(schema.member).where(eq(schema.member.userId, "carol"));
    expect(m.role).toBe("member");
    const [g] = await db.select().from(schema.environmentKeyGrant).where(eq(schema.environmentKeyGrant.principalId, "carol"));
    expect(g).toMatchObject({ envId: ws.envId, wrappedKey: w("carol"), keyVersion: 1 });
    expect((await redeemInvite(db, people.erin, id, [{ envId: ws.envId, wrappedKey: w("e") }])).status).toBe("not-found");
  });

  it("refuses extra or missing environments and leaves nothing behind", async () => {
    const second = { id: crypto.randomUUID(), name: "prod", wrappedKey: w("prod") };
    await createEnvironment(db, "alice", ws.projectId, second);
    const id = await mk([{ envId: ws.envId, wrappedKey: w("a") }, { envId: second.id, wrappedKey: w("b") }]);
    const one = [{ envId: ws.envId, wrappedKey: w("c") }];
    expect((await redeemInvite(db, people.erin, id, one)).status).toBe("bad-grants");
    expect((await redeemInvite(db, people.erin, id, [...one, { envId: crypto.randomUUID(), wrappedKey: w("d") }])).status).toBe("bad-grants");
    expect(await db.select().from(schema.member).where(eq(schema.member.userId, "erin"))).toHaveLength(0);
    expect(await getInviteOffer(db, people.erin, id)).not.toBeNull();
  });

  it("expired, revoked and unknown invites look the same: not found", async () => {
    const g = [{ envId: ws.envId, wrappedKey: w("z") }];
    const old = await mk();
    const later = new Date(Date.now() + INVITE_TTL_MS + 1000);
    expect((await redeemInvite(db, people.erin, old, g, later)).status).toBe("not-found");
    const revoked = await mk();
    expect(await revokeInvite(db, "dave", revoked)).toBe("forbidden");
    expect(await revokeInvite(db, "bob", revoked)).toBe("not-found");
    expect(await revokeInvite(db, "alice", revoked)).toBe("ok");
    expect(await revokeInvite(db, "alice", revoked)).toBe("not-found");
    expect((await redeemInvite(db, people.erin, revoked, g)).status).toBe("not-found");
    expect((await redeemInvite(db, people.erin, crypto.randomUUID(), g)).status).toBe("not-found");
  });

  it("an email-bound invite needs that verified address", async () => {
    const id = await mk(undefined, "Erin@Example.com");
    const g = [{ envId: ws.envId, wrappedKey: w("e") }];
    expect((await redeemInvite(db, people.carol, id, g)).status).toBe("not-found");
    expect((await redeemInvite(db, people.erin, id, g)).status).toBe("not-found"); // right address, not verified
    expect((await redeemInvite(db, { ...people.erin, emailVerified: true }, id, g)).status).toBe("joined");
  });

  it("existing members cannot redeem, and pending invites list only for owners/admins", async () => {
    const id = await mk();
    expect((await redeemInvite(db, people.carol, id, [{ envId: ws.envId, wrappedKey: w("c2") }])).status).toBe("already-member");
    expect((await listPendingInvites(db, "alice", ws.orgId))!.map((i) => i.id)).toContain(id);
    expect(await listPendingInvites(db, "dave", ws.orgId)).toBeNull();
    expect(await listPendingInvites(db, "bob", ws.orgId)).toBeNull();
  });
});
