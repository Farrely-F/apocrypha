import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createVaultRecord } from "../vault/store";
import type { WorkspaceIds } from "../workspace/shared";
import { entryHash, GENESIS, verifyChain, type ChainEntry } from "./chain";
import { exportAudit, listAudit, noteEnvRead, pruneAudit, recordAudit, verifyOrgChain } from "./store";

let db: ReturnType<typeof drizzle<typeof schema>>;
let ws: WorkspaceIds;
let other: WorkspaceIds;
const w = "v1|x25519-hkdf-a256gcm|eph|ct";
const DAY = 86_400_000;

async function mkOrg(id: string) {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  const r = await createVaultRecord(db, id, {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: w, orgName: id, projectName: "P", environmentName: "dev" },
  });
  if (r.status !== "created") throw new Error("setup");
  return { orgId: r.orgId, projectId: r.projectId, envId: r.envId };
}

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-audit-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  ws = await mkOrg("alice");
  other = await mkOrg("zed");
  for (const [id, role] of [["dave", "admin"], ["erin", "member"]] as const) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
    await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: ws.orgId, userId: id, role });
  }
  await db.insert(schema.environmentKeyGrant).values({ envId: ws.envId, principalType: "user", principalId: "erin", keyVersion: 1, wrappedKey: w });
});

const entries = async (orgId: string) => (await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.organizationId, orgId)).orderBy(schema.auditEvent.seq)) as ChainEntry[];

describe("hash chain", () => {
  it("links every entry to the previous one and verifies", async () => {
    await recordAudit(db, { orgId: ws.orgId, actorId: "alice", type: "invite.created", data: { inviteId: "i1" } });
    await recordAudit(db, { orgId: ws.orgId, actorId: "alice", type: "member.removed", targetUserId: "erin", envId: ws.envId });
    const rows = await entries(ws.orgId);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows[0].prevHash).toBe(GENESIS);
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(await verifyOrgChain(db, ws.orgId)).toMatchObject({ ok: true, count: 2, head: rows[1].hash });
  });

  it("never forks when appends race", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => recordAudit(db, { orgId: ws.orgId, actorId: "alice", type: "secret.created", envId: ws.envId, data: { n: i } })));
    const rows = await entries(ws.orgId);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await verifyOrgChain(db, ws.orgId)).toMatchObject({ ok: true, count: 10 });
  });

  it("detects a changed row, a deleted row, a reordered row and a swapped hash", async () => {
    const rows = await entries(ws.orgId);
    const changed = rows.map((r) => (r.seq === 4 ? { ...r, type: "secret.deleted" } : r));
    expect(verifyChain(changed)).toMatchObject({ ok: false, brokenAt: 4, reason: "contents were changed" });
    const missing = rows.filter((r) => r.seq !== 5);
    expect(verifyChain(missing)).toMatchObject({ ok: false, brokenAt: 5 });
    const swapped = [rows[0], rows[2], rows[1], ...rows.slice(3)];
    expect(verifyChain(swapped).ok).toBe(false);
    // an attacker who edits a row AND recomputes its hash still breaks the next link
    const forged = rows.map((r) => (r.seq === 3 ? { ...r, type: "x", hash: entryHash({ ...r, type: "x" }) } : r));
    expect(verifyChain(forged)).toMatchObject({ ok: false, brokenAt: 4 });
    // and it works against the real table too
    await db.update(schema.auditEvent).set({ type: "secret.deleted" }).where(and(eq(schema.auditEvent.organizationId, ws.orgId), eq(schema.auditEvent.seq, 6)));
    expect(await verifyOrgChain(db, ws.orgId)).toMatchObject({ ok: false, brokenAt: 6 });
    await db.update(schema.auditEvent).set({ type: "secret.created" }).where(and(eq(schema.auditEvent.organizationId, ws.orgId), eq(schema.auditEvent.seq, 6)));
    expect((await verifyOrgChain(db, ws.orgId)).ok).toBe(true);
  });

  it("keeps each organisation's chain separate", async () => {
    await recordAudit(db, { orgId: other.orgId, actorId: "zed", type: "org.created" });
    expect((await entries(other.orgId))[0]).toMatchObject({ seq: 1, prevHash: GENESIS });
  });
});

describe("who sees what", () => {
  it("owners and admins see the org log; members only their own environments and themselves; outsiders nothing", async () => {
    const owner = await listAudit(db, "alice", ws.orgId);
    expect(owner!.scope).toBe("org");
    expect(owner!.events).toHaveLength(10);
    expect((await listAudit(db, "dave", ws.orgId))!.events).toHaveLength(10);
    const member = await listAudit(db, "erin", ws.orgId);
    expect(member!.scope).toBe("own");
    // erin holds ws.envId: its 9 events (8 secret writes + the removal on that env), but not the env-less invite event
    expect(member!.events.every((e) => e.envId === ws.envId || e.targetUserId === "erin")).toBe(true);
    expect(member!.events.some((e) => e.type === "invite.created")).toBe(false);
    expect(await listAudit(db, "alice", other.orgId)).toBeNull();
    expect(await listAudit(db, "stranger", ws.orgId)).toBeNull();
    expect(owner!.events[0]).toMatchObject({ actorName: "alice" });
  });

  it("exports only for owners, with the head hash", async () => {
    expect(await exportAudit(db, "dave", ws.orgId)).toBe("forbidden");
    expect(await exportAudit(db, "stranger", ws.orgId)).toBe("not-found");
    const out = await exportAudit(db, "alice", ws.orgId);
    if (typeof out === "string") throw new Error(out);
    const rows = await entries(ws.orgId);
    expect(out).toMatchObject({ count: 10, headSeq: 10, headHash: rows[9].hash, prunedThrough: 0 });
    expect(verifyChain(out.events)).toMatchObject({ ok: true, head: out.headHash });
  });
});

describe("retention and read logging", () => {
  it("prunes old events but the rest still verify from the checkpoint", async () => {
    const fresh = await mkOrg("fran");
    const old = Date.now() - 200 * DAY;
    await recordAudit(db, { orgId: fresh.orgId, actorId: "fran", type: "a" }, old);
    await recordAudit(db, { orgId: fresh.orgId, actorId: "fran", type: "b" }, old + 1000);
    await recordAudit(db, { orgId: fresh.orgId, actorId: "fran", type: "c" });
    expect(await pruneAudit(db, fresh.orgId, Date.now(), 180)).toBe(2);
    expect(await verifyOrgChain(db, fresh.orgId)).toMatchObject({ ok: true, count: 1 });
    await recordAudit(db, { orgId: fresh.orgId, actorId: "fran", type: "d" });
    expect(await verifyOrgChain(db, fresh.orgId)).toMatchObject({ ok: true, count: 2 });
    const out = await exportAudit(db, "fran", fresh.orgId);
    if (typeof out === "string") throw new Error(out);
    expect(out.prunedThrough).toBe(2);
  });

  it("notes an environment read once per session", async () => {
    expect(await noteEnvRead(db, "s1", ws.envId)).toBe(true);
    expect(await noteEnvRead(db, "s1", ws.envId)).toBe(false);
    expect(await noteEnvRead(db, "s2", ws.envId)).toBe(true);
  });
});
