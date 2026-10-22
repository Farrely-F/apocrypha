import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { ACCESS_ACTIONS, checkAccessEntry, listAccessLog, logAdminAccess, retentionDays } from "./access-log";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22);
const ADMIN = "Fv1COeWdlkNIHnH3grRiOJbKOpydqoQ9";

let db: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-access-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("what may be written to the access log", () => {
  it("takes a known action and opaque ids, and nothing else", () => {
    expect(checkAccessEntry({ actorId: ADMIN, action: "view_users" })).toBeNull();
    expect(checkAccessEntry({ actorId: ADMIN, action: "reveal_email", subjectId: "u-123456789abc" })).toBeNull();
    expect(checkAccessEntry({ actorId: ADMIN, action: "delete_everything" })).toBe("unknown action");
    expect(checkAccessEntry({ actorId: "me@example.com", action: "view_users" })).toBe("actor is not an opaque id");
    expect(checkAccessEntry({ actorId: ADMIN, action: "reveal_email", subjectId: "alice@example.com" })).toBe("subject is not an opaque id");
    expect(checkAccessEntry({ actorId: ADMIN, action: "lookup_email", subjectId: "a b" })).toBe("subject is not an opaque id");
    expect(checkAccessEntry({ actorId: "short", action: "view_users" })).toBe("actor is not an opaque id");
  });

  it("refuses an email address even when it is the only thing wrong, and writes nothing", async () => {
    await expect(logAdminAccess(db, { actorId: ADMIN, action: "reveal_email", subjectId: "alice@example.com" }, NOW)).rejects.toThrow(/refused/);
    expect(await listAccessLog(db)).toHaveLength(0);
  });

  it("names every action the page performs", () => {
    expect(ACCESS_ACTIONS).toEqual(["view_overview", "view_users", "reveal_email", "lookup_email", "view_health", "run_chain_check", "view_access_log"]);
  });
});

describe("keeping it", () => {
  it("records who did what, newest first, and holds no address", async () => {
    await logAdminAccess(db, { actorId: ADMIN, action: "view_users" }, NOW - 2000);
    await logAdminAccess(db, { actorId: ADMIN, action: "reveal_email", subjectId: "u-123456789abc" }, NOW - 1000);
    const rows = await listAccessLog(db);
    expect(rows.map((r) => r.action)).toEqual(["reveal_email", "view_users"]);
    expect(rows[0]).toMatchObject({ actorId: ADMIN, subjectId: "u-123456789abc" });
    expect(JSON.stringify(rows)).not.toContain("@");
  });

  it("forgets rows older than the window whenever it writes", async () => {
    await db.insert(schema.systemAccessLog).values({ id: crypto.randomUUID(), at: NOW - 200 * DAY, actorId: ADMIN, action: "view_users", subjectId: null });
    await db.insert(schema.systemAccessLog).values({ id: crypto.randomUUID(), at: NOW - 170 * DAY, actorId: ADMIN, action: "view_users", subjectId: null });
    await logAdminAccess(db, { actorId: ADMIN, action: "view_health" }, NOW);
    const ages = (await listAccessLog(db)).map((r) => Math.round((NOW - r.at) / DAY));
    expect(ages.every((a) => a < 180)).toBe(true);
    expect(ages).toContain(170);
    expect(ages).not.toContain(200);
  });

  it("keeps 180 days by default and takes SYSTEM_ACCESS_LOG_DAYS, falling back to the audit setting", () => {
    expect(retentionDays({})).toBe(180);
    expect(retentionDays({ SYSTEM_ACCESS_LOG_DAYS: "30" })).toBe(30);
    expect(retentionDays({ AUDIT_RETENTION_DAYS: "90" })).toBe(90);
    expect(retentionDays({ SYSTEM_ACCESS_LOG_DAYS: "0" })).toBe(180);
    expect(retentionDays({ SYSTEM_ACCESS_LOG_DAYS: "nope" })).toBe(180);
  });
});
