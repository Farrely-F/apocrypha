import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import type { VaultPayload } from "../vault/payload";
import { createVaultRecord } from "../vault/store";
import {
  environmentPath,
  getDefaultEnvironmentForUser,
  getEnvironmentForUser,
  type WorkspaceIds,
} from "./queries";

const payload = (): VaultPayload => {
  const envId = crypto.randomUUID();
  return {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: {
      envId,
      wrappedKey: `v1|x25519-hkdf-a256gcm|eph|ct-${envId}`,
      orgName: "Personal",
      projectName: "First project",
      environmentName: "dev",
    },
  };
};

let db: ReturnType<typeof drizzle<typeof schema>>;
let alice: WorkspaceIds;
let bob: WorkspaceIds;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-workspace-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "nobody"]) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  }
  const a = await createVaultRecord(db, "alice", payload());
  const b = await createVaultRecord(db, "bob", payload());
  if (a.status !== "created" || b.status !== "created") throw new Error("setup failed");
  alice = { orgId: a.orgId, projectId: a.projectId, envId: a.envId };
  bob = { orgId: b.orgId, projectId: b.projectId, envId: b.envId };
});

describe("getEnvironmentForUser", () => {
  it("returns plaintext names, role and key version for the owner", async () => {
    const view = await getEnvironmentForUser(db, "alice", alice);
    expect(view).toMatchObject({
      ...alice,
      orgName: "Personal",
      role: "owner",
      projectName: "First project",
      environmentName: "dev",
      currentKeyVersion: 1,
    });
  });

  it("refuses another user, even with the right ids", async () => {
    expect(await getEnvironmentForUser(db, "bob", alice)).toBeNull();
    expect(await getEnvironmentForUser(db, "nobody", alice)).toBeNull();
  });

  it("refuses ids that do not form an org > project > environment chain", async () => {
    expect(await getEnvironmentForUser(db, "alice", { ...alice, orgId: bob.orgId })).toBeNull();
    expect(await getEnvironmentForUser(db, "alice", { ...alice, projectId: bob.projectId })).toBeNull();
    expect(await getEnvironmentForUser(db, "alice", { ...alice, envId: bob.envId })).toBeNull();
    expect(await getEnvironmentForUser(db, "alice", { ...alice, envId: "nope" })).toBeNull();
  });

  it("needs a grant as well as membership", async () => {
    await db
      .delete(schema.environmentKeyGrant)
      .where(
        and(
          eq(schema.environmentKeyGrant.envId, bob.envId),
          eq(schema.environmentKeyGrant.principalId, "bob"),
        ),
      );
    expect(await getEnvironmentForUser(db, "bob", bob)).toBeNull();
    expect(await getDefaultEnvironmentForUser(db, "bob")).toBeNull();
  });

  it("needs membership as well as a grant", async () => {
    await db
      .delete(schema.member)
      .where(and(eq(schema.member.organizationId, alice.orgId), eq(schema.member.userId, "alice")));
    expect(await getEnvironmentForUser(db, "alice", alice)).toBeNull();
    expect(await getDefaultEnvironmentForUser(db, "alice")).toBeNull();
  });
});

describe("getDefaultEnvironmentForUser", () => {
  it("is null for a user with no workspace", async () => {
    expect(await getDefaultEnvironmentForUser(db, "nobody")).toBeNull();
  });

  it("finds the personal environment, and the route path round-trips", async () => {
    const dir = mkdtempSync(join(tmpdir(), "apocrypha-workspace-"));
    const fresh = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
    await migrate(fresh, { migrationsFolder: "drizzle" });
    await fresh.insert(schema.user).values({ id: "c", name: "c", email: "c@example.com" });
    const r = await createVaultRecord(fresh, "c", payload());
    if (r.status !== "created") throw new Error("setup failed");
    const found = await getDefaultEnvironmentForUser(fresh, "c");
    expect(found).toEqual({ orgId: r.orgId, projectId: r.projectId, envId: r.envId });
    expect(environmentPath(found!)).toBe(`/o/${r.orgId}/p/${r.projectId}/e/${r.envId}`);
  });
});
