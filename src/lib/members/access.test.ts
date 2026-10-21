import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createSecret, getEnvironmentKeys } from "../secrets/store";
import { createVaultRecord } from "../vault/store";
import { getEnvironmentForUser } from "../workspace/queries";
import type { WorkspaceIds } from "../workspace/shared";
import { listAccess, planAccess, setAccess } from "./access";
import { removeMember } from "./store";

let db: ReturnType<typeof drizzle<typeof schema>>;
let ws: WorkspaceIds;
const w = (t = "A") => `v1|x25519-hkdf-a256gcm|${"E".repeat(43)}|${"C".repeat(63)}${t}`;
const PUB = "v1|x25519|AAAA";
const secretBody = (keyVersion: number) => ({ secretId: crypto.randomUUID(), keyVersion, name: "n", value: "v", metadata: null });
const levelOf = async (u: string) => (await planAccess(db, "alice", ws.orgId, u, ws.envId)) as Extract<Awaited<ReturnType<typeof planAccess>>, { status: "ok" }>;

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-acc-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "carol", "dave", "erin"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, "alice", {
    publicKey: PUB,
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: w(), orgName: "Org", projectName: "P", environmentName: "dev" },
  });
  if (r.status !== "created") throw new Error("setup");
  ws = { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  for (const [id, role] of [["bob", "member"], ["carol", "member"], ["dave", "admin"]] as const) {
    await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: ws.orgId, userId: id, role });
    await db.insert(schema.vault).values({ userId: id, publicKey: PUB, passphraseBlob: "p", recoveryBlob: "r" });
  }
  await db.insert(schema.vault).values({ userId: "erin", publicKey: PUB, passphraseBlob: "p", recoveryBlob: "r" });
  await db.insert(schema.environmentKeyGrant).values({ envId: ws.envId, principalType: "user", principalId: "carol", keyVersion: 1, wrappedKey: w("c") });
});

describe("who may change access", () => {
  it("only owners and admins who can open the environment, and only for plain members", async () => {
    expect((await planAccess(db, "bob", ws.orgId, "carol", ws.envId)).status).toBe("forbidden");
    expect((await planAccess(db, "erin", ws.orgId, "carol", ws.envId)).status).toBe("not-found"); // not in the org
    expect((await planAccess(db, "alice", ws.orgId, "dave", ws.envId)).status).toBe("not-a-member-role"); // admins are always full
    expect((await planAccess(db, "alice", ws.orgId, "alice", ws.envId)).status).toBe("not-a-member-role");
    expect((await planAccess(db, "dave", ws.orgId, "carol", ws.envId)).status).toBe("needs-key"); // dave cannot open it, so cannot hand it out
    expect((await planAccess(db, "alice", ws.orgId, "carol", crypto.randomUUID())).status).toBe("not-found");
    expect(await listAccess(db, "bob", ws.orgId)).toBeNull();
    const t = (await listAccess(db, "alice", ws.orgId))!;
    const lv = (u: string) => t.members.find((m) => m.userId === u)!.levels[ws.envId];
    expect([lv("alice"), lv("dave"), lv("carol"), lv("bob")]).toEqual(["write", "write", "read", "none"]);
    expect((await listAccess(db, "dave", ws.orgId))!.environments).toEqual([]); // dave can open nothing here
  });
});

describe("granting access", () => {
  it("gives a member with no access every key version we hold, exactly", async () => {
    const plan = await levelOf("bob");
    expect(plan).toMatchObject({ current: "none", keyVersions: [1], currentKeyVersion: 1 });
    const bad = [undefined, [], [{ keyVersion: 2, wrappedKey: w() }], [{ keyVersion: 1, wrappedKey: "v1|p256-hkdf-a256gcm|x|y" }], [{ keyVersion: 1, wrappedKey: w() }, { keyVersion: 1, wrappedKey: w() }]];
    for (const grants of bad) expect((await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "read", grants })).status).toBe("bad-keys");
    expect(await getEnvironmentKeys(db, "bob", ws.envId)).toBeNull();
    expect(await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "read", grants: [{ keyVersion: 1, wrappedKey: w("b") }] })).toMatchObject({ status: "changed", from: "none", to: "read", rotated: false });
    expect((await getEnvironmentKeys(db, "bob", ws.envId))?.canWrite).toBe(false);
  });
});

describe("write access", () => {
  it("is enforced where secrets are written, for plain members only", async () => {
    // bob and carol hold the key but may not write
    expect((await createSecret(db, "bob", ws.envId, secretBody(1))).status).toBe("forbidden");
    expect((await createSecret(db, "carol", ws.envId, secretBody(1))).status).toBe("forbidden");
    expect((await getEnvironmentForUser(db, "bob", ws))!.canWrite).toBe(false);
    // read -> write flips only the write grant
    expect(await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "write" })).toMatchObject({ status: "changed", from: "read", to: "write", rotated: false });
    expect((await createSecret(db, "bob", ws.envId, secretBody(1))).status).toBe("created");
    expect((await getEnvironmentForUser(db, "bob", ws))!.canWrite).toBe(true);
    expect((await createSecret(db, "carol", ws.envId, secretBody(1))).status).toBe("forbidden"); // carol is unaffected
    expect((await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "write" })).status).toBe("unchanged");
    // write -> read takes it back, with no key change
    expect(await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "read" })).toMatchObject({ to: "read", rotated: false });
    expect((await createSecret(db, "bob", ws.envId, secretBody(1))).status).toBe("forbidden");
    expect((await getEnvironmentKeys(db, "bob", ws.envId))?.currentKeyVersion).toBe(1);
  });
});

describe("taking access away", () => {
  it("rotates the key to exactly the remaining holders, drops the member, and refuses stale writes", async () => {
    await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "write" });
    const plan = await levelOf("bob");
    expect(plan.recipients.map((r) => r.userId).sort()).toEqual(["alice", "carol"]);
    const wrongSets = [undefined, [{ userId: "alice", wrappedKey: w() }], [{ userId: "alice", wrappedKey: w() }, { userId: "carol", wrappedKey: w() }, { userId: "bob", wrappedKey: w() }], [{ userId: "alice", wrappedKey: w() }, { userId: "erin", wrappedKey: w() }]];
    for (const rotation of wrongSets) expect((await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "none", rotation })).status).toBe("bad-keys");
    expect((await getEnvironmentKeys(db, "bob", ws.envId))?.canWrite).toBe(true); // nothing moved

    const rotation = [{ userId: "alice", wrappedKey: w("1") }, { userId: "carol", wrappedKey: w("2") }];
    expect(await setAccess(db, "alice", ws.orgId, "bob", ws.envId, { level: "none", rotation })).toMatchObject({ from: "write", to: "none", rotated: true });
    expect(await getEnvironmentKeys(db, "bob", ws.envId)).toBeNull();
    expect(await db.select().from(schema.environmentWrite).where(and(eq(schema.environmentWrite.envId, ws.envId), eq(schema.environmentWrite.userId, "bob")))).toHaveLength(0);
    expect((await getEnvironmentKeys(db, "carol", ws.envId))?.currentKeyVersion).toBe(2);
    expect((await createSecret(db, "alice", ws.envId, secretBody(1))).status).toBe("stale-key"); // a tab still on the old key
    expect((await createSecret(db, "alice", ws.envId, secretBody(2))).status).toBe("created");
  });

  it("removing a member also clears their write grant", async () => {
    await setAccess(db, "alice", ws.orgId, "carol", ws.envId, { level: "write" });
    const plan = await levelOf("carol");
    const rotation = plan.recipients.map((r) => ({ userId: r.userId, wrappedKey: w("r") }));
    expect((await removeMember(db, "alice", ws.orgId, "carol", [{ envId: ws.envId, grants: rotation }])).status).toBe("removed");
    expect(await db.select().from(schema.environmentWrite).where(eq(schema.environmentWrite.userId, "carol"))).toHaveLength(0);
  });
});
