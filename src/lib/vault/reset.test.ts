import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { applyRegrant, pendingRegrants, planRegrant } from "../members/regrant";
import { removeMember } from "../members/store";
import { createEnvironment } from "../workspace/manage";
import type { WorkspaceIds } from "../workspace/shared";
import { previewReset, resetVault } from "./reset";
import { createVaultRecord, getVaultRecord } from "./store";

let db: ReturnType<typeof drizzle<typeof schema>>;
const w = (t = "A") => `v1|x25519-hkdf-a256gcm|${"E".repeat(43)}|${"C".repeat(63)}${t}`;
const NEWPUB = "v1|x25519|NEWKEY";
const blob = `v1|argon2id-a256gcm|x25519|m=19456,t=2,p=1|${"s".repeat(22)}|${"i".repeat(16)}|${"c".repeat(60)}`;
let alice: WorkspaceIds, carol: WorkspaceIds; // their personal workspaces
let shared: { orgId: string; projectId: string; envId: string };
let hidden: { orgId: string; envId: string };

const payload = () => ({
  publicKey: NEWPUB,
  passphraseBlob: blob,
  recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
  workspace: { envId: crypto.randomUUID(), wrappedKey: w("N"), orgName: "Personal", projectName: "First project", environmentName: "dev" },
});
const grantsOf = async (u: string) => (await db.select().from(schema.environmentKeyGrant).where(eq(schema.environmentKeyGrant.principalId, u))).map((g) => g.envId);

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-reset-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  const mkUser = async (id: string) => {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
    const r = await createVaultRecord(db, id, {
      publicKey: "v1|x25519|OLDKEY",
      passphraseBlob: blob,
      recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
      workspace: { envId: crypto.randomUUID(), wrappedKey: w(id[0]), orgName: "Personal", projectName: "First project", environmentName: "dev" },
    });
    if (r.status !== "created") throw new Error("setup");
    return { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  };
  alice = await mkUser("alice");
  carol = await mkUser("carol");
  await mkUser("dave");
  // alice's org: carol is a member who holds one environment alice (owner) also holds
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: alice.orgId, userId: "carol", role: "member" });
  await db.insert(schema.environmentKeyGrant).values({ envId: alice.envId, principalType: "user", principalId: "carol", keyVersion: 1, wrappedKey: w("c") });
  shared = alice;
  // an environment only carol (a member) holds, in dave's org: nobody who can re-share it
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: (await db.select().from(schema.member).where(eq(schema.member.userId, "dave")))[0].organizationId, userId: "carol", role: "member" });
  const daveOrg = (await db.select().from(schema.member).where(eq(schema.member.userId, "dave")))[0].organizationId;
  const daveProject = (await db.select().from(schema.project).where(eq(schema.project.organizationId, daveOrg)))[0].id;
  const e = { id: crypto.randomUUID(), name: "secretless", wrappedKey: w("h") };
  await db.insert(schema.environment).values({ id: e.id, projectId: daveProject, name: e.name, currentKeyVersion: 1 });
  await db.insert(schema.environmentKeyGrant).values({ envId: e.id, principalType: "user", principalId: "carol", keyVersion: 1, wrappedKey: w("h") });
  hidden = { orgId: daveOrg, envId: e.id };
  void createEnvironment;
});

describe("reset to a new key pair", () => {
  it("previews what can be recovered and what is lost", async () => {
    const p = await previewReset(db, "carol");
    expect(p.recoverable.map((e) => e.envId)).toEqual([shared.envId]); // alice (owner) also holds it
    expect(p.lost.map((e) => e.envId).sort()).toEqual([carol.envId, hidden.envId].sort()); // her own, and one nobody can re-share
  });

  it("swaps the key, drops old grants and lost environments, records requests, seeds a workspace", async () => {
    const p = payload();
    const r = await resetVault(db, "carol", p);
    if (r.status !== "reset") throw new Error(r.status);
    expect((await getVaultRecord(db, "carol"))!.publicKey).toBe(NEWPUB);
    expect(await grantsOf("carol")).toEqual([p.workspace.envId]); // only the new environment
    expect(await db.select().from(schema.environment).where(eq(schema.environment.id, carol.envId))).toHaveLength(0);
    expect(await db.select().from(schema.environment).where(eq(schema.environment.id, hidden.envId))).toHaveLength(0);
    expect(await db.select().from(schema.organization).where(eq(schema.organization.id, carol.orgId))).toHaveLength(0);
    // other people's data is untouched
    expect(await grantsOf("alice")).toContain(shared.envId);
    expect(await db.select().from(schema.environment).where(eq(schema.environment.id, shared.envId))).toHaveLength(1);
    const reqs = await db.select().from(schema.regrantRequest).where(eq(schema.regrantRequest.userId, "carol"));
    expect(reqs.map((q) => q.envId)).toEqual([shared.envId]);
    expect((await resetVault(db, "nobody", p)).status).toBe("no-vault");
    expect((await resetVault(db, "carol", p)).status).toBe("env-exists"); // the same environment id again
  });
});

describe("admin re-grant", () => {
  it("only owners and admins who hold the key, and only the exact set of versions", async () => {
    expect(await pendingRegrants(db, "alice", shared.orgId)).toEqual(["carol"]);
    expect(await pendingRegrants(db, "carol", shared.orgId)).toBeNull();
    expect((await planRegrant(db, "carol", shared.orgId, "carol")).status).toBe("forbidden");
    expect((await planRegrant(db, "dave", shared.orgId, "carol")).status).toBe("not-found");
    const plan = await planRegrant(db, "alice", shared.orgId, "carol");
    if (plan.status !== "ok") throw new Error(plan.status);
    expect(plan.publicKey).toBe(NEWPUB);
    expect(plan.environments[0].keyVersions).toEqual([1]);

    const one = { envId: shared.envId, keyVersion: 1, wrappedKey: w("g") };
    expect((await applyRegrant(db, "alice", shared.orgId, "carol", [])).status).toBe("bad-grants");
    expect((await applyRegrant(db, "alice", shared.orgId, "carol", [{ ...one, keyVersion: 2 }])).status).toBe("bad-grants");
    expect((await applyRegrant(db, "alice", shared.orgId, "carol", [one, one])).status).toBe("bad-grants");
    expect((await applyRegrant(db, "alice", shared.orgId, "carol", [{ ...one, wrappedKey: "v1|p256-hkdf-a256gcm|x|y" }])).status).toBe("bad-grants");
    expect(await grantsOf("carol")).not.toContain(shared.envId);

    expect(await applyRegrant(db, "alice", shared.orgId, "carol", [one])).toEqual({ status: "granted", envIds: [shared.envId] });
    expect(await grantsOf("carol")).toContain(shared.envId);
    expect(await db.select().from(schema.regrantRequest).where(eq(schema.regrantRequest.userId, "carol"))).toHaveLength(0);
    expect((await planRegrant(db, "alice", shared.orgId, "carol")).status).toBe("nothing");
  });

  it("removing a member clears their pending requests", async () => {
    await db.insert(schema.regrantRequest).values({ envId: shared.envId, userId: "carol" });
    await db.delete(schema.environmentKeyGrant).where(and(eq(schema.environmentKeyGrant.principalId, "carol"), eq(schema.environmentKeyGrant.envId, shared.envId)));
    const r = await removeMember(db, "alice", shared.orgId, "carol", []);
    expect(r.status).toBe("removed");
    expect(await db.select().from(schema.regrantRequest).where(eq(schema.regrantRequest.userId, "carol"))).toHaveLength(0);
  });
});
