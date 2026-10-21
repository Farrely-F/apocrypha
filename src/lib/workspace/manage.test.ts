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
import { createEnvironment, createProject, listWorkspaceTree } from "./manage";
import type { WorkspaceIds } from "./shared";

let db: ReturnType<typeof drizzle<typeof schema>>;
let alice: WorkspaceIds;
const wrapped = (t: string) => `v1|x25519-hkdf-a256gcm|eph|${t}`;
const env = (name: string) => ({ id: crypto.randomUUID(), name, wrappedKey: wrapped(name) });

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-manage-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "dave"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, "alice", {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: wrapped("first"), orgName: "Personal", projectName: "First project", environmentName: "dev" },
  });
  if (r.status !== "created") throw new Error("setup");
  alice = { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: alice.orgId, userId: "dave", role: "member" });
});

describe("projects and environments", () => {
  it("lists only what the user can open", async () => {
    const t = await listWorkspaceTree(db, "alice");
    expect(t).toHaveLength(1);
    expect(t[0].projects[0].environments.map((e) => e.name)).toEqual(["dev"]);
    expect(await listWorkspaceTree(db, "bob")).toEqual([]);
    // a member with no grant sees no environment, so no project either
    expect((await listWorkspaceTree(db, "dave"))[0].projects).toEqual([]);
  });

  it("creates a project with its first environment and the creator's grant", async () => {
    const e = env("dev");
    const r = await createProject(db, "alice", { orgId: alice.orgId, name: "Billing", environment: e });
    expect(r).toMatchObject({ status: "created", orgId: alice.orgId, envId: e.id });
    const [g] = await db.select().from(schema.environmentKeyGrant).where(eq(schema.environmentKeyGrant.envId, e.id));
    expect(g).toMatchObject({ principalId: "alice", keyVersion: 1, wrappedKey: e.wrappedKey });
    const names = (await listWorkspaceTree(db, "alice"))[0].projects.map((p) => p.name);
    expect(names).toEqual(["First project", "Billing"]);
  });

  it("adds an environment to an existing project", async () => {
    const e = env("staging");
    const r = await createEnvironment(db, "alice", alice.projectId, e);
    expect(r).toMatchObject({ status: "created", projectId: alice.projectId });
    expect((await listWorkspaceTree(db, "alice"))[0].projects[0].environments.map((x) => x.name)).toEqual(["dev", "staging"]);
  });

  it("refuses duplicate names without leaving anything behind", async () => {
    expect((await createProject(db, "alice", { orgId: alice.orgId, name: "Billing", environment: env("dev") })).status).toBe("name-taken");
    expect((await createEnvironment(db, "alice", alice.projectId, env("staging"))).status).toBe("name-taken");
    const e = env("x");
    await createEnvironment(db, "alice", alice.projectId, e);
    expect((await createEnvironment(db, "alice", alice.projectId, { ...env("y"), id: e.id })).status).toBe("env-exists");
    expect(await db.select().from(schema.environment).where(eq(schema.environment.name, "y"))).toHaveLength(0);
  });

  it("only owners and admins may create; outsiders learn nothing", async () => {
    expect((await createProject(db, "dave", { orgId: alice.orgId, name: "Nope", environment: env("dev") })).status).toBe("forbidden");
    expect((await createProject(db, "bob", { orgId: alice.orgId, name: "Nope", environment: env("dev") })).status).toBe("forbidden");
    expect((await createEnvironment(db, "dave", alice.projectId, env("nope"))).status).toBe("forbidden");
    expect((await createEnvironment(db, "bob", alice.projectId, env("nope"))).status).toBe("not-found");
    expect((await createEnvironment(db, "alice", crypto.randomUUID(), env("nope"))).status).toBe("not-found");
    expect(await db.select().from(schema.project).where(eq(schema.project.name, "Nope"))).toHaveLength(0);
  });
});
