import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { authRule } from "./auth-limits";

describe("which auth requests are counted", () => {
  it("counts code guessing hardest, then sign-in, then everything else that writes", () => {
    expect(authRule("POST", "/api/auth/two-factor/verify-totp")).toMatchObject({ name: "second-factor", limit: 10 });
    expect(authRule("POST", "/api/auth/two-factor/verify-backup-code")).toMatchObject({ name: "second-factor" });
    expect(authRule("POST", "/api/auth/sign-in/email")).toMatchObject({ name: "sign-in", limit: 20 });
    expect(authRule("POST", "/api/auth/sign-in/social")).toMatchObject({ name: "sign-in" });
    expect(authRule("GET", "/api/auth/callback/google")).toMatchObject({ name: "provider-callback" });
    expect(authRule("POST", "/api/auth/link-social")).toMatchObject({ name: "account" });
    expect(authRule("POST", "/api/auth/two-factor/enable")).toMatchObject({ name: "account" });
    expect(authRule("POST", "/api/auth/sign-out")).toMatchObject({ name: "auth" });
  });
  it("leaves reads alone, so the session check the client polls is never refused", () => {
    expect(authRule("GET", "/api/auth/get-session")).toBeNull();
    expect(authRule("GET", "/api/auth/list-sessions")).toBeNull();
  });
});

describe("the sign-in routes, per client address", () => {
  let POST: (r: Request) => Promise<Response>;
  let GET: (r: Request) => Promise<Response>;
  beforeAll(async () => {
    process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-authlimit-")), "t.db")}`;
    process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.TRUSTED_PROXY_HOPS = "1";
    const { db } = await import("@/lib/db/client");
    await migrate(db, { migrationsFolder: "drizzle" });
    ({ POST, GET } = await import("@/app/api/auth/[...all]/route"));
  });
  const from = (ip: string, path: string, method = "POST") =>
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip },
      body: method === "POST" ? JSON.stringify({ code: "000000" }) : undefined,
    });

  it("refuses the 11th code guess in a minute from one address, and only that address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(from("203.0.113.7", "/api/auth/two-factor/verify-totp"))).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect((await POST(from("203.0.113.8", "/api/auth/two-factor/verify-totp"))).status).not.toBe(429);
  });

  it("tells a client when to come back", async () => {
    const res = await POST(from("203.0.113.7", "/api/auth/two-factor/verify-totp"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("has no shared bucket when no address can be trusted, so one client cannot lock everyone else out", async () => {
    // No X-Forwarded-For, and a different X-Real-IP every time: nothing here is believed, so nothing is counted.
    // (Code guessing is bounded without any address: see the two-factor tests in auth/two-factor-gate.test.ts.)
    let refused = 0;
    for (let i = 0; i < 60; i++) {
      const res = await POST(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-real-ip": `198.51.100.${i}` },
          body: JSON.stringify({ email: "a@b.co", password: "x" }),
        }),
      );
      if (res.status === 429) refused++;
    }
    expect(refused).toBe(0);
  });

  it("refuses the 21st sign-in attempt in a minute", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await POST(from("203.0.113.9", "/api/auth/sign-in/email"))).status;
    expect(last).toBe(429);
  });

  it("never refuses the session check", async () => {
    for (let i = 0; i < 40; i++) expect((await GET(from("203.0.113.7", "/api/auth/get-session", "GET"))).status).not.toBe(429);
  });

  it("cannot be dodged by writing a different address at the front of X-Forwarded-For", async () => {
    // the address our own proxy appended is last; whatever the client wrote before it is ignored
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await POST(from(`10.0.0.${i}, 198.51.100.5`, "/api/auth/two-factor/verify-totp"))).status;
    expect(last).toBe(429);
  });
});
