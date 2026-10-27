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
import { createEnvironment, createProject, listWorkspaceTree, updateEnvironment, updateProject } from "./manage";
import { getEnvironmentForUser } from "./queries";
import type { WorkspaceIds } from "./shared";

let db: ReturnType<typeof drizzle<typeof schema>>;
let alice: WorkspaceIds;
const wrapped = (t: string) => `v1|x25519-hkdf-a256gcm|eph|${t}`;
const env = (name: string, kind?: "dev" | "staging" | "prod" | "other") => ({ id: crypto.randomUUID(), name, wrappedKey: wrapped(name), kind });

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-details-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "dave"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, "alice", {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: wrapped("first"), orgName: "Personal", projectName: "First project", environmentName: "Production" },
  });
  if (r.status !== "created") throw new Error("setup");
  alice = { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: alice.orgId, userId: "dave", role: "member" });
});

describe("project details and environment kind", () => {
  it("guesses the kind of the first environment from its name", async () => {
    const [p] = (await listWorkspaceTree(db, "alice"))[0].projects;
    expect(p.environments[0].kind).toBe("prod");
    expect(p).toMatchObject({ description: null, tags: [], repoUrl: null, docsUrl: null });
  });

  it("stores details given at creation, and an explicit kind", async () => {
    const e = env("blue", "staging");
    await createProject(db, "alice", {
      orgId: alice.orgId,
      name: "Billing",
      environment: e,
      details: { description: "Invoices", tags: ["payments", "api"], repoUrl: "https://github.com/acme/billing" },
    });
    const p = (await listWorkspaceTree(db, "alice"))[0].projects.find((x) => x.name === "Billing")!;
    expect(p).toMatchObject({ description: "Invoices", tags: ["payments", "api"], repoUrl: "https://github.com/acme/billing", docsUrl: null });
    expect(p.environments[0].kind).toBe("staging");
    // without a kind, the name decides
    const added = env("dev");
    await createEnvironment(db, "alice", p.id, added);
    const [row] = await db.select({ kind: schema.environment.kind }).from(schema.environment).where(eq(schema.environment.id, added.id));
    expect(row.kind).toBe("dev");
  });

  it("changes only the fields sent and clears with null or an empty list", async () => {
    const id = alice.projectId;
    expect((await updateProject(db, "alice", id, { description: "Core", tags: ["core"] })).status).toBe("ok");
    expect((await updateProject(db, "alice", id, { repoUrl: "https://example.com/r" })).status).toBe("ok");
    let p = (await listWorkspaceTree(db, "alice"))[0].projects.find((x) => x.id === id)!;
    expect(p).toMatchObject({ name: "First project", description: "Core", tags: ["core"], repoUrl: "https://example.com/r" });
    await updateProject(db, "alice", id, { description: null, tags: [], repoUrl: null });
    p = (await listWorkspaceTree(db, "alice"))[0].projects.find((x) => x.id === id)!;
    expect(p).toMatchObject({ description: null, tags: [], repoUrl: null });
  });

  it("keeps the name rules and the role rules", async () => {
    expect((await updateProject(db, "alice", alice.projectId, { name: "Billing" })).status).toBe("name-taken");
    expect((await updateProject(db, "dave", alice.projectId, { tags: ["x"] })).status).toBe("forbidden");
    expect((await updateProject(db, "nobody", alice.projectId, { tags: ["x"] })).status).toBe("not-found");
    expect((await updateEnvironment(db, "dave", alice.envId, { kind: "dev" })).status).toBe("forbidden");
  });

  it("changes an environment's kind, and shows it with the project on its page", async () => {
    expect((await updateEnvironment(db, "alice", alice.envId, { kind: "other" })).status).toBe("ok");
    await updateProject(db, "alice", alice.projectId, { tags: ["core"] });
    const view = await getEnvironmentForUser(db, "alice", alice);
    expect(view).toMatchObject({ environmentKind: "other", project: { tags: ["core"] } });
  });
});
