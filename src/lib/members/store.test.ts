import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createInvite } from "../invites/store";
import { getEnvironmentKeys } from "../secrets/store";
import { createVaultRecord } from "../vault/store";
import type { WorkspaceIds } from "../workspace/shared";
import { changeRole, listMembers, planRemoval, removeMember } from "./store";

let db: ReturnType<typeof drizzle<typeof schema>>;
let ws: WorkspaceIds;
// A well-formed wrapped key for x25519: the server checks the shape, never the content.
const WRAPPED_CT = "C".repeat(64);
const w = (tag = "A") => `v1|x25519-hkdf-a256gcm|${"E".repeat(43)}|${WRAPPED_CT.slice(0, 63)}${tag}`;
const PUB = "v1|x25519|AAAA";
const grantRow = (u: string, version = 1) => ({ envId: ws.envId, principalType: "user" as const, principalId: u, keyVersion: version, wrappedKey: w() });
const versionsOf = async (u: string) =>
  (await db.select().from(schema.environmentKeyGrant).where(and(eq(schema.environmentKeyGrant.envId, ws.envId), eq(schema.environmentKeyGrant.principalId, u)))).map((g) => g.keyVersion).sort();

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-mem-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "carol", "dave", "erin", "zed"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, "alice", {
    publicKey: PUB,
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: w(), orgName: "Org", projectName: "P", environmentName: "dev" },
  });
  if (r.status !== "created") throw new Error("setup");
  ws = { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  for (const [id, role] of [["bob", "member"], ["carol", "member"], ["dave", "admin"], ["zed", "admin"]] as const) {
    await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: ws.orgId, userId: id, role });
    await db.insert(schema.vault).values({ userId: id, publicKey: PUB, passphraseBlob: "p", recoveryBlob: "r" });
  }
  // bob and carol can open the environment; dave and zed are admins who cannot
  await db.insert(schema.environmentKeyGrant).values([grantRow("bob"), grantRow("carol")]);
});

describe("members and roles", () => {
  it("only members list the org; only an owner changes roles, never an owner's", async () => {
    expect((await listMembers(db, "alice", ws.orgId))!.map((m) => m.userId).sort()).toEqual(["alice", "bob", "carol", "dave", "zed"]);
    expect(await listMembers(db, "erin", ws.orgId)).toBeNull();
    expect(await changeRole(db, "dave", ws.orgId, "bob", "admin")).toBe("forbidden");
    expect(await changeRole(db, "erin", ws.orgId, "bob", "admin")).toBe("not-found");
    expect(await changeRole(db, "alice", ws.orgId, "bob", "owner")).toBe("bad-role");
    expect(await changeRole(db, "alice", ws.orgId, "alice", "member")).toBe("forbidden");
    expect(await changeRole(db, "alice", ws.orgId, "bob", "admin")).toBe("ok");
    expect(await changeRole(db, "alice", ws.orgId, "bob", "member")).toBe("ok");
  });
});

describe("removal and key rotation", () => {
  it("refuses people who may not remove, and admins who cannot open what would rotate", async () => {
    expect((await planRemoval(db, "bob", ws.orgId, "carol")).status).toBe("forbidden");
    expect((await planRemoval(db, "dave", ws.orgId, "zed")).status).toBe("forbidden"); // admin cannot remove admin
    expect((await planRemoval(db, "dave", ws.orgId, "alice")).status).toBe("forbidden"); // nobody removes an owner
    expect((await planRemoval(db, "alice", ws.orgId, "alice")).status).toBe("forbidden");
    expect((await planRemoval(db, "erin", ws.orgId, "bob")).status).toBe("not-found");
    // dave is an admin but holds no key for the environment bob can open: he would learn the new key
    expect(await planRemoval(db, "dave", ws.orgId, "bob")).toMatchObject({ status: "needs-key", environments: ["P / dev"] });
  });

  it("only accepts a rotation that answers exactly what the server computed", async () => {
    const plan = await planRemoval(db, "alice", ws.orgId, "bob");
    if (plan.status !== "ok") throw new Error("plan");
    expect(plan.environments[0].recipients.map((r) => r.userId).sort()).toEqual(["alice", "carol"]);
    const good = [{ userId: "alice", wrappedKey: w("1") }, { userId: "carol", wrappedKey: w("2") }];
    const attempt = (grants: typeof good, envId = ws.envId) => removeMember(db, "alice", ws.orgId, "bob", [{ envId, grants }]);
    expect((await attempt(good.slice(0, 1))).status).toBe("bad-rotation"); // carol would lose access
    expect((await attempt([...good, { userId: "bob", wrappedKey: w("3") }])).status).toBe("bad-rotation"); // the removed person
    expect((await attempt([...good, { userId: "dave", wrappedKey: w("4") }])).status).toBe("bad-rotation"); // someone with no access
    expect((await attempt([good[0], { userId: "carol", wrappedKey: "v1|p256-hkdf-a256gcm|x|y" }])).status).toBe("bad-rotation");
    expect((await attempt(good, crypto.randomUUID())).status).toBe("bad-rotation");
    expect((await removeMember(db, "alice", ws.orgId, "bob", [])).status).toBe("bad-rotation");
    // nothing moved
    expect((await getEnvironmentKeys(db, "bob", ws.envId))?.currentKeyVersion).toBe(1);
    expect(await versionsOf("alice")).toEqual([1]);
  });

  it("rotates to a new version, drops the removed member, keeps old versions for the rest, revokes carrying invites", async () => {
    const pending = await createInvite(db, "alice", { orgId: ws.orgId, email: null, ephemeralPublicKey: "v1|x25519|AAAA", redeemHash: "0".repeat(64), grants: [{ envId: ws.envId, keyVersion: 1, wrappedKey: w("i") }] });
    if (pending.status !== "created") throw new Error("invite");
    const r = await removeMember(db, "alice", ws.orgId, "bob", [{ envId: ws.envId, grants: [{ userId: "alice", wrappedKey: w("1") }, { userId: "carol", wrappedKey: w("2") }] }]);
    expect(r).toEqual({ status: "removed", rotated: [{ envId: ws.envId, keyVersion: 2 }] });
    expect(await getEnvironmentKeys(db, "bob", ws.envId)).toBeNull();
    expect(await db.select().from(schema.member).where(eq(schema.member.userId, "bob"))).toHaveLength(0);
    expect(await versionsOf("bob")).toEqual([]);
    expect(await versionsOf("alice")).toEqual([1, 2]);
    expect(await versionsOf("carol")).toEqual([1, 2]);
    expect((await getEnvironmentKeys(db, "carol", ws.envId))?.currentKeyVersion).toBe(2);
    const [inv] = await db.select().from(schema.invite).where(eq(schema.invite.id, pending.inviteId));
    expect(inv.revokedAt).not.toBeNull();
    // the target is gone, so a second removal finds nobody
    expect((await planRemoval(db, "alice", ws.orgId, "bob")).status).toBe("not-found");
  });
});
