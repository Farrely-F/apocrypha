import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";

const BASE = "http://localhost:3000";
const ADMIN = "boss@example.com";

// The real auth and routes on a throwaway database.
let auth: typeof import("@/lib/auth/auth").auth;
let db: typeof import("@/lib/db/client").db;
let schema: typeof import("@/lib/db/schema");
let reveal: (r: Request) => Promise<Response>;
let chainCheck: (r: Request) => Promise<Response>;

class Jar {
  cookies = new Map<string, string>();
  take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  get header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function signUp(email: string) {
  const jar = new Jar();
  const res = await auth.handler(new Request(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password: "test-password-123", name: email.split("@")[0] }) }));
  expect(res.status).toBe(200);
  jar.take(res);
  return jar;
}
const post = (handler: (r: Request) => Promise<Response>, jar: Jar | null, body?: object, origin = BASE) =>
  handler(new Request(`${BASE}/api/system/x`, { method: "POST", headers: { "content-type": "application/json", origin, ...(jar ? { cookie: jar.header } : {}) }, body: body ? JSON.stringify(body) : undefined }));
const idOf = async (email: string) => (await db.select().from(schema.user).where(eq(schema.user.email, email)))[0].id;
const verify = (email: string) => db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.email, email));
const accessRows = () => db.select().from(schema.systemAccessLog);

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-sysapi-")), "t.db")}`;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = BASE;
  process.env.APOCRYPHA_TEST_AUTH = "1";
  process.env.SYSTEM_ADMIN_EMAILS = ADMIN;
  delete process.env.SYSTEM_ADMIN_ENABLED;
  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  ({ auth } = await import("@/lib/auth/auth"));
  await migrate(db, { migrationsFolder: "drizzle" });
  ({ POST: reveal } = await import("@/app/api/system/reveal/route"));
  ({ POST: chainCheck } = await import("@/app/api/system/chain-check/route"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("the administrator API says nothing to anyone else", () => {
  it("is a plain 404 with no session, for another person, across origins, and for an unverified address", async () => {
    const boss = await signUp(ADMIN); // password accounts start unverified
    const other = await signUp("someone@example.com");
    await verify("someone@example.com");
    const target = await idOf("someone@example.com");

    expect((await post(reveal, null, { userId: target })).status).toBe(404);
    expect((await post(reveal, other, { userId: target })).status).toBe(404);
    expect((await post(chainCheck, other)).status).toBe(404);
    expect((await post(reveal, boss, { userId: target })).status).toBe(404); // listed, but the address is not verified
    await verify(ADMIN);
    expect((await post(reveal, boss, { userId: target }, "https://evil.example")).status).toBe(404); // another origin
    expect(await accessRows()).toHaveLength(0); // none of that was an administrator looking at anything
    const body = await (await post(reveal, other, { userId: target })).json();
    expect(body).toEqual({ error: "Not found." }); // the same words as any unknown route
  });

  it("does not exist when switched off, or when nobody is configured", async () => {
    const boss = await signUp("second@example.com"); // a different account, listed below
    await verify("second@example.com");
    process.env.SYSTEM_ADMIN_EMAILS = "second@example.com";
    const target = await idOf(ADMIN);
    expect((await post(reveal, boss, { userId: target })).status).toBe(200);
    process.env.SYSTEM_ADMIN_ENABLED = "false";
    expect((await post(reveal, boss, { userId: target })).status).toBe(404);
    delete process.env.SYSTEM_ADMIN_ENABLED;
    process.env.SYSTEM_ADMIN_EMAILS = "";
    expect((await post(reveal, boss, { userId: target })).status).toBe(404);
    process.env.SYSTEM_ADMIN_EMAILS = ADMIN;
    await db.delete(schema.systemAccessLog);
  });

  it("asks an administrator with an old sign-in to sign in again, and shows nothing", async () => {
    const boss = await signUp("old@example.com");
    await verify("old@example.com");
    process.env.SYSTEM_ADMIN_EMAILS = "old@example.com";
    await db.update(schema.session).set({ createdAt: new Date(Date.now() - 3 * 3_600_000) });
    const res = await post(reveal, boss, { userId: await idOf(ADMIN) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "RECENT_SIGN_IN_REQUIRED" });
    expect((await post(chainCheck, boss)).status).toBe(403);
    expect(await accessRows()).toHaveLength(0);
    process.env.SYSTEM_ADMIN_EMAILS = ADMIN;
  });
});

describe("what the administrator can do, and what it leaves behind", () => {
  it("shows one address, and the log records that it happened without recording the address", async () => {
    await db.update(schema.session).set({ createdAt: new Date() });
    const boss = await signUp("fresh-admin@example.com");
    await verify("fresh-admin@example.com");
    process.env.SYSTEM_ADMIN_EMAILS = "fresh-admin@example.com";
    const target = await idOf("someone@example.com");
    const res = await post(reveal, boss, { userId: target });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "someone@example.com" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    const rows = await accessRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "reveal_email", subjectId: target, actorId: await idOf("fresh-admin@example.com") });
    expect(JSON.stringify(rows)).not.toContain("@");
  });

  it("refuses a malformed request, and logs first: if the log cannot be written, nothing is shown", async () => {
    const boss = await signUp("careful-admin@example.com");
    await verify("careful-admin@example.com");
    process.env.SYSTEM_ADMIN_EMAILS = "careful-admin@example.com";
    expect((await post(reveal, boss, { userId: "alice@example.com" })).status).toBe(400);
    expect((await post(reveal, boss, {})).status).toBe(400);
    const { client } = await import("@/lib/db/client");
    await client.execute("alter table system_access_log rename to system_access_log_x");
    try {
      const res = await post(reveal, boss, { userId: await idOf("someone@example.com") });
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain("someone@example.com");
    } finally {
      await client.execute("alter table system_access_log_x rename to system_access_log");
    }
  });

  it("runs the chain check on request, records it, and is rate limited", async () => {
    const boss = await signUp("checker@example.com");
    await verify("checker@example.com");
    process.env.SYSTEM_ADMIN_EMAILS = "checker@example.com";
    const before = (await accessRows()).length;
    const res = await post(chainCheck, boss);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checkedOrgs: expect.any(Number), broken: [], limits: { orgs: 25, events: 5000 } });
    expect((await accessRows()).filter((r) => r.action === "run_chain_check")).toHaveLength(1);
    expect((await accessRows()).length).toBe(before + 1);
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await post(chainCheck, boss)).status;
    expect(last).toBe(429); // 12 an hour
  });
});
