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
import { parseNewShare } from "./payload";
import { createShare, listShares, openShare, revokeShare } from "./store";

let db: ReturnType<typeof drizzle<typeof schema>>;
let ws: WorkspaceIds;
const ENVELOPE = `v1|link|${"A".repeat(16)}|${"B".repeat(40)}`;
const body = (over: Record<string, unknown> = {}) => {
  const r = parseNewShare({ id: crypto.randomUUID(), envelope: ENVELOPE, itemCount: 3, maxViews: 1, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const mk = async (over: Record<string, unknown> = {}, now = new Date()) => {
  const r = await createShare(db, "alice", ws.envId, body(over), now);
  if (r.status !== "created") throw new Error(r.status);
  return r.id;
};

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-share-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["alice", "bob", "dave"]) await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, "alice", {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: "w", orgName: "O", projectName: "P", environmentName: "dev" },
  });
  if (r.status !== "created") throw new Error("setup");
  ws = { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: ws.orgId, userId: "dave", role: "member" });
  await db.insert(schema.environmentKeyGrant).values({ envId: ws.envId, principalType: "user", principalId: "dave", keyVersion: 1, wrappedKey: "w" });
});

describe("creating share links", () => {
  it("needs a limit, a valid envelope and sane numbers", () => {
    expect(parseNewShare({ id: crypto.randomUUID(), envelope: ENVELOPE, itemCount: 1 })).toMatchObject({ ok: false });
    expect(parseNewShare({ id: crypto.randomUUID(), envelope: "nope", itemCount: 1, maxViews: 1 })).toMatchObject({ ok: false });
    expect(parseNewShare({ id: crypto.randomUUID(), envelope: ENVELOPE, itemCount: 1, maxViews: 0 })).toMatchObject({ ok: false });
    expect(parseNewShare({ id: crypto.randomUUID(), envelope: ENVELOPE, itemCount: 1, expiresInMinutes: 999999999 })).toMatchObject({ ok: false });
    expect(parseNewShare({ id: crypto.randomUUID(), envelope: ENVELOPE, itemCount: 1, expiresInMinutes: 60, plaintext: "x" })).toMatchObject({ ok: false });
    expect(parseNewShare({ id: crypto.randomUUID(), envelope: ENVELOPE, itemCount: 1, expiresInMinutes: 60 })).toMatchObject({ ok: true });
  });

  it("only owners and admins who can open the environment; strangers learn nothing", async () => {
    expect((await createShare(db, "dave", ws.envId, body())).status).toBe("forbidden"); // member
    expect((await createShare(db, "bob", ws.envId, body())).status).toBe("not-found");
    expect((await createShare(db, "alice", crypto.randomUUID(), body())).status).toBe("not-found");
    await db.update(schema.member).set({ role: "admin" }).where(eq(schema.member.userId, "dave"));
    await db.delete(schema.environmentKeyGrant).where(eq(schema.environmentKeyGrant.principalId, "dave"));
    expect((await createShare(db, "dave", ws.envId, body())).status).toBe("not-found"); // admin without the key cannot seal anything
    await db.update(schema.member).set({ role: "member" }).where(eq(schema.member.userId, "dave"));
    const dup = body();
    expect((await createShare(db, "alice", ws.envId, dup)).status).toBe("created");
    expect((await createShare(db, "alice", ws.envId, dup)).status).toBe("exists");
  });
});

describe("opening share links as a guest", () => {
  it("burns after the allowed views", async () => {
    const id = await mk({ maxViews: 2 });
    expect((await openShare(db, id))?.views).toBe(1);
    expect((await openShare(db, id))?.views).toBe(2);
    expect(await openShare(db, id)).toBeNull();
  });

  it("expires by date, and whichever limit comes first wins", async () => {
    const now = new Date();
    const timed = await mk({ maxViews: undefined, expiresInMinutes: 10 }, now);
    expect(await openShare(db, timed, new Date(now.getTime() + 9 * 60_000))).not.toBeNull();
    expect(await openShare(db, timed, new Date(now.getTime() + 11 * 60_000))).toBeNull();
    const both = await mk({ maxViews: 1, expiresInMinutes: 60 }, now);
    expect(await openShare(db, both, now)).not.toBeNull();
    expect(await openShare(db, both, now)).toBeNull(); // views used up long before the date
  });

  it("two guests racing for the last view cannot both get it", async () => {
    const id = await mk({ maxViews: 1 });
    const got = await Promise.all([openShare(db, id), openShare(db, id), openShare(db, id)]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it("revoked and unknown links look the same as burned ones", async () => {
    const id = await mk({ maxViews: 5 });
    expect(await revokeShare(db, "dave", id)).toBe("forbidden");
    expect(await revokeShare(db, "bob", id)).toBe("not-found");
    expect(await revokeShare(db, "alice", id)).toBe("ok");
    expect(await openShare(db, id)).toBeNull();
    expect(await openShare(db, crypto.randomUUID())).toBeNull();
  });
});

describe("owner metadata", () => {
  it("lists metadata for owners and admins only, never the envelope", async () => {
    const rows = await listShares(db, "alice", ws.orgId);
    expect(rows!.length).toBeGreaterThan(3);
    expect(JSON.stringify(rows)).not.toContain(ENVELOPE);
    expect(rows![0]).toMatchObject({ envName: "dev", projectName: "P", createdByName: "alice" });
    expect(await listShares(db, "dave", ws.orgId)).toBeNull();
    expect(await listShares(db, "bob", ws.orgId)).toBeNull();
  });
});
