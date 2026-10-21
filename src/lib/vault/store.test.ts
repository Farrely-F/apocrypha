import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createVaultRecord, getVaultRecord } from "./store";
import type { VaultPayload } from "./payload";

const payload = (envId = crypto.randomUUID()): VaultPayload => ({
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
});

let db: ReturnType<typeof drizzle<typeof schema>>;

const tables = {
  vault: schema.vault,
  organization: schema.organization,
  member: schema.member,
  project: schema.project,
  environment: schema.environment,
  grant: schema.environmentKeyGrant,
};

async function rowCounts() {
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const [r] = await db.select({ n: count() }).from(table);
    out[name] = r.n;
  }
  return out;
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-vault-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["u1", "u2", "u3"]) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  }
});

describe("vault store", () => {
  it("has no vault before creation", async () => {
    expect(await getVaultRecord(db, "u1")).toBeNull();
  });

  it("creates the vault and the whole personal workspace together", async () => {
    const p = payload();
    const r = await createVaultRecord(db, "u1", p);
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.envId).toBe(p.workspace.envId);

    const row = await getVaultRecord(db, "u1");
    expect(row?.publicKey).toBe(p.publicKey);
    expect(row?.passphraseBlob).toBe(p.passphraseBlob);

    const [org] = await db.select().from(schema.organization);
    expect(org).toMatchObject({ id: r.orgId, name: "Personal", slug: `personal-${r.orgId}` });
    const [m] = await db.select().from(schema.member);
    expect(m).toMatchObject({ organizationId: r.orgId, userId: "u1", role: "owner" });
    const [proj] = await db.select().from(schema.project);
    expect(proj).toMatchObject({ id: r.projectId, organizationId: r.orgId, name: "First project" });
    const [env] = await db.select().from(schema.environment);
    expect(env).toMatchObject({
      id: p.workspace.envId,
      projectId: r.projectId,
      name: "dev",
      currentKeyVersion: 1,
    });
    const [grant] = await db.select().from(schema.environmentKeyGrant);
    expect(grant).toMatchObject({
      envId: p.workspace.envId,
      principalType: "user",
      principalId: "u1",
      keyVersion: 1,
      wrappedKey: p.workspace.wrappedKey,
    });
  });

  it("a second create returns exists and creates nothing", async () => {
    const before = await rowCounts();
    const second = payload();
    expect(await createVaultRecord(db, "u1", { ...second, publicKey: "v1|x25519|BBBB" })).toEqual({
      status: "exists",
    });
    expect(await rowCounts()).toEqual(before);
    expect((await getVaultRecord(db, "u1"))?.publicKey).toBe("v1|x25519|AAAA");
  });

  it("keeps vaults and workspaces separate per user", async () => {
    expect(await getVaultRecord(db, "u2")).toBeNull();
    const r = await createVaultRecord(db, "u2", payload());
    expect(r.status).toBe("created");
    const counts = await rowCounts();
    expect(counts).toEqual({ vault: 2, organization: 2, member: 2, project: 2, environment: 2, grant: 2 });
  });

  it("rolls the vault and everything else back when any step fails", async () => {
    // The environment id of u1's workspace is taken, so the insert of u3's
    // environment fails AFTER the vault, org, member and project were inserted.
    const [taken] = await db.select().from(schema.environment).limit(1);
    const before = await rowCounts();
    const failure = await createVaultRecord(db, "u3", payload(taken.id)).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error & { cause?: unknown }).cause)).toMatch(/constraint|unique|primary/i);
    expect(await rowCounts()).toEqual(before);
    expect(await getVaultRecord(db, "u3")).toBeNull();

    // The user can still create their vault afterwards.
    expect((await createVaultRecord(db, "u3", payload())).status).toBe("created");
  });

  it("removes the membership with its user and the workspace with its org", async () => {
    await db.delete(schema.user).where(eq(schema.user.id, "u2"));
    expect(await getVaultRecord(db, "u2")).toBeNull();
    const members = await db.select().from(schema.member).where(eq(schema.member.userId, "u2"));
    expect(members).toHaveLength(0);

    const [org] = await db.select().from(schema.organization).limit(1);
    await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
    const [{ n: grants }] = await db.select({ n: count() }).from(schema.environmentKeyGrant);
    const [{ n: envs }] = await db.select({ n: count() }).from(schema.environment);
    expect(envs).toBe(2);
    expect(grants).toBe(2);
  });
});
