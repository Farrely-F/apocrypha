import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createVaultRecord } from "../vault/store";
import type { WorkspaceIds } from "../workspace/shared";
import { createSecret, getEnvironmentKeys, listSecrets } from "./store";

const cipher = (tag: string) => `v1|a256gcm|${"A".repeat(16)}|${tag.padEnd(24, "x")}`;
const body = (keyVersion = 1) => ({
  secretId: crypto.randomUUID(),
  keyVersion,
  name: cipher("name"),
  value: cipher("value"),
  metadata: null as string | null,
});

let db: ReturnType<typeof drizzle<typeof schema>>;
let alice: WorkspaceIds;
let bob: WorkspaceIds;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-secrets-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "carol"]) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  }
  const make = async (userId: string) => {
    const envId = crypto.randomUUID();
    const r = await createVaultRecord(db, userId, {
      publicKey: "v1|x25519|AAAA",
      passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
      recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
      workspace: {
        envId,
        wrappedKey: `v1|x25519-hkdf-a256gcm|eph|wrapped-for-${userId}`,
        orgName: "Personal",
        projectName: "First project",
        environmentName: "dev",
      },
    });
    if (r.status !== "created") throw new Error("setup failed");
    return { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  };
  alice = await make("alice");
  bob = await make("bob");
});

describe("secrets store", () => {
  it("returns the caller's own grant, and nothing for an outsider", async () => {
    const mine = await getEnvironmentKeys(db, "alice", alice.envId);
    expect(mine?.grants).toEqual([{ keyVersion: 1, wrappedKey: "v1|x25519-hkdf-a256gcm|eph|wrapped-for-alice" }]);
    expect(await getEnvironmentKeys(db, "bob", alice.envId)).toBeNull();
    expect(await getEnvironmentKeys(db, "carol", alice.envId)).toBeNull();
  });

  it("creates a secret as version 1 and lists it", async () => {
    const b = body();
    expect(await createSecret(db, "alice", alice.envId, b)).toEqual({ status: "created", id: b.secretId, version: 1 });
    const list = await listSecrets(db, "alice", alice.envId);
    expect(list).toHaveLength(1);
    expect(list![0]).toMatchObject({ id: b.secretId, version: 1, keyVersion: 1, name: b.name, value: b.value, metadata: null });
  });

  it("stores only what it was given (ciphertext), and records the key version", async () => {
    const [v] = await db.select().from(schema.secretVersion);
    expect(v.name.startsWith("v1|a256gcm|")).toBe(true);
    expect(v.value.startsWith("v1|a256gcm|")).toBe(true);
    expect(v.keyVersion).toBe(1);
    expect(v.createdBy).toBe("alice");
  });

  it("refuses another user's environment for both read and write", async () => {
    expect(await listSecrets(db, "bob", alice.envId)).toBeNull();
    expect((await createSecret(db, "bob", alice.envId, body())).status).toBe("forbidden");
    expect((await createSecret(db, "carol", alice.envId, body())).status).toBe("forbidden");
    expect(await db.select().from(schema.secret).where(eq(schema.secret.environmentId, alice.envId))).toHaveLength(1);
  });

  it("refuses a key version the environment is not on", async () => {
    expect((await createSecret(db, "alice", alice.envId, body(2))).status).toBe("stale-key");
    expect((await createSecret(db, "alice", alice.envId, body(0))).status).toBe("stale-key");
  });

  it("refuses to create the same secret id twice, even across environments", async () => {
    const b = body();
    expect((await createSecret(db, "alice", alice.envId, b)).status).toBe("created");
    expect((await createSecret(db, "alice", alice.envId, b)).status).toBe("exists");
    expect((await createSecret(db, "bob", bob.envId, b)).status).toBe("exists");
    expect(await listSecrets(db, "bob", bob.envId)).toEqual([]);
  });

  it("keeps environments separate", async () => {
    const mine = await listSecrets(db, "bob", bob.envId);
    expect(mine).toEqual([]);
    expect((await listSecrets(db, "alice", alice.envId))!.length).toBe(2);
  });

  it("is read-only for a plain member (only owner and admin write)", async () => {
    await db.insert(schema.user).values({ id: "dave", name: "dave", email: "dave@example.com" });
    await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: alice.orgId, userId: "dave", role: "member" });
    await db.insert(schema.environmentKeyGrant).values({ envId: alice.envId, principalType: "user", principalId: "dave", keyVersion: 1, wrappedKey: "v1|x25519-hkdf-a256gcm|eph|wrapped-for-dave" });
    expect((await listSecrets(db, "dave", alice.envId))!.length).toBe(2);
    expect((await createSecret(db, "dave", alice.envId, body())).status).toBe("forbidden");
  });

  it("leaves nothing behind when the version insert fails", async () => {
    const before = (await db.select().from(schema.secret)).length;
    const bad = { ...body(), name: null as unknown as string };
    await expect(createSecret(db, "alice", alice.envId, bad)).rejects.toThrow();
    expect((await db.select().from(schema.secret)).length).toBe(before);
  });
});
