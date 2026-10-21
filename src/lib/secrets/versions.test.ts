import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createVaultRecord } from "../vault/store";
import type { WorkspaceIds } from "../workspace/shared";
import { addVersion, createSecret, createSecrets, listSecrets, listVersions } from "./store";

const sealed = (tag: string) => `v1|a256gcm|${"A".repeat(16)}|${tag.padEnd(24, "x")}`;
const create = (tag = "n") => ({ secretId: crypto.randomUUID(), keyVersion: 1, name: sealed(tag), value: sealed(tag + "v"), metadata: null as string | null });
const next = (baseVersion: number, tag: string, extra: { deleted?: boolean } = {}) => ({
  baseVersion, keyVersion: 1, name: sealed(tag), value: sealed(tag + "v"), metadata: null as string | null, deleted: extra.deleted ?? false,
});

let db: ReturnType<typeof drizzle<typeof schema>>;
let alice: WorkspaceIds;
let bob: WorkspaceIds;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-versions-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "dave"]) await db.insert(schema.user).values({ id, name: `${id} name`, email: `${id}@example.com` });
  const make = async (userId: string) => {
    const r = await createVaultRecord(db, userId, {
      publicKey: "v1|x25519|AAAA",
      passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
      recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
      workspace: { envId: crypto.randomUUID(), wrappedKey: `v1|x25519-hkdf-a256gcm|eph|w-${userId}`, orgName: "Personal", projectName: "P", environmentName: "dev" },
    });
    if (r.status !== "created") throw new Error("setup");
    return { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  };
  alice = await make("alice");
  bob = await make("bob");
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: alice.orgId, userId: "dave", role: "member" });
  await db.insert(schema.environmentKeyGrant).values({ envId: alice.envId, principalType: "user", principalId: "dave", keyVersion: 1, wrappedKey: "v1|x25519-hkdf-a256gcm|eph|w-dave" });
});

describe("addVersion", () => {
  it("appends version 2 on top of version 1 and the list shows the latest", async () => {
    const c = create("one");
    await createSecret(db, "alice", alice.envId, c);
    expect(await addVersion(db, "alice", alice.envId, c.secretId, next(1, "two"))).toEqual({ status: "created", version: 2 });
    const row = (await listSecrets(db, "alice", alice.envId))!.find((r) => r.id === c.secretId)!;
    expect(row.version).toBe(2);
    expect(row.name).toBe(sealed("two"));
  });

  it("refuses a stale edit with a conflict that carries the newer version", async () => {
    const c = create("c");
    await createSecret(db, "alice", alice.envId, c);
    await addVersion(db, "alice", alice.envId, c.secretId, next(1, "theirs"));
    const r = await addVersion(db, "alice", alice.envId, c.secretId, next(1, "mine"));
    expect(r.status).toBe("conflict");
    if (r.status === "conflict") {
      expect(r.latest.version).toBe(2);
      expect(r.latest.name).toBe(sealed("theirs"));
    }
    // nothing was overwritten
    const versions = await listVersions(db, "alice", alice.envId, c.secretId);
    expect(versions!.map((v) => v.version)).toEqual([1, 2]);
  });

  it("lets exactly one of two racing edits win", async () => {
    const c = create("race");
    await createSecret(db, "alice", alice.envId, c);
    const [a, b] = await Promise.all([
      addVersion(db, "alice", alice.envId, c.secretId, next(1, "a")),
      addVersion(db, "alice", alice.envId, c.secretId, next(1, "b")),
    ]);
    expect([a.status, b.status].sort()).toEqual(["conflict", "created"]);
    expect((await listVersions(db, "alice", alice.envId, c.secretId))!.length).toBe(2);
  });

  it("does not let you skip ahead", async () => {
    const c = create("skip");
    await createSecret(db, "alice", alice.envId, c);
    expect((await addVersion(db, "alice", alice.envId, c.secretId, next(5, "x"))).status).toBe("conflict");
  });

  it("refuses outsiders, read-only members, missing secrets and other environments", async () => {
    const c = create("acl");
    await createSecret(db, "alice", alice.envId, c);
    expect((await addVersion(db, "bob", alice.envId, c.secretId, next(1, "x"))).status).toBe("forbidden");
    expect((await addVersion(db, "dave", alice.envId, c.secretId, next(1, "x"))).status).toBe("forbidden");
    expect((await addVersion(db, "alice", alice.envId, crypto.randomUUID(), next(1, "x"))).status).toBe("not-found");
    expect((await addVersion(db, "bob", bob.envId, c.secretId, next(1, "x"))).status).toBe("not-found");
  });

  it("refuses a key version the environment is not on", async () => {
    const c = create("kv");
    await createSecret(db, "alice", alice.envId, c);
    expect((await addVersion(db, "alice", alice.envId, c.secretId, { ...next(1, "x"), keyVersion: 2 })).status).toBe("stale-key");
  });

  it("a tombstone hides the secret from the list but keeps its history", async () => {
    const c = create("del");
    await createSecret(db, "alice", alice.envId, c);
    expect(await addVersion(db, "alice", alice.envId, c.secretId, next(1, "del", { deleted: true }))).toEqual({ status: "created", version: 2 });
    expect((await listSecrets(db, "alice", alice.envId))!.some((r) => r.id === c.secretId)).toBe(false);
    const h = (await listVersions(db, "alice", alice.envId, c.secretId))!;
    expect(h.map((v) => [v.version, v.deleted])).toEqual([[1, false], [2, true]]);
    // editing a deleted secret is a conflict, not a resurrection
    expect((await addVersion(db, "alice", alice.envId, c.secretId, next(1, "x"))).status).toBe("conflict");
  });
});

describe("listVersions", () => {
  it("returns every version oldest first with who wrote it", async () => {
    const c = create("hist");
    await createSecret(db, "alice", alice.envId, c);
    await addVersion(db, "alice", alice.envId, c.secretId, next(1, "b"));
    const h = (await listVersions(db, "alice", alice.envId, c.secretId))!;
    expect(h.map((v) => v.version)).toEqual([1, 2]);
    expect(h[0]).toMatchObject({ createdBy: "alice", createdByName: "alice name", keyVersion: 1, deleted: false });
  });

  it("is null for outsiders and for a secret in another environment", async () => {
    const c = create("priv");
    await createSecret(db, "alice", alice.envId, c);
    expect(await listVersions(db, "bob", alice.envId, c.secretId)).toBeNull();
    expect(await listVersions(db, "bob", bob.envId, c.secretId)).toBeNull();
    expect(await listVersions(db, "alice", alice.envId, crypto.randomUUID())).toBeNull();
  });
});

describe("createSecrets (batch)", () => {
  it("creates all of them, or none", async () => {
    const before = (await listSecrets(db, "alice", alice.envId))!.length;
    const good = [create("b1"), create("b2"), create("b3")];
    expect(await createSecrets(db, "alice", alice.envId, good)).toEqual({ status: "created", ids: good.map((g) => g.secretId) });
    expect((await listSecrets(db, "alice", alice.envId))!.length).toBe(before + 3);

    const dup = [create("c1"), { ...create("c2"), secretId: good[0].secretId }, create("c3")];
    expect((await createSecrets(db, "alice", alice.envId, dup)).status).toBe("exists");
    expect((await listSecrets(db, "alice", alice.envId))!.length).toBe(before + 3);
  });

  it("applies the same access rules", async () => {
    expect((await createSecrets(db, "bob", alice.envId, [create("x")])).status).toBe("forbidden");
    expect((await createSecrets(db, "dave", alice.envId, [create("x")])).status).toBe("forbidden");
    expect((await createSecrets(db, "alice", alice.envId, [{ ...create("x"), keyVersion: 3 }])).status).toBe("stale-key");
  });
});
