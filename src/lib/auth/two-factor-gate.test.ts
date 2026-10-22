import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OAUTH_REDIRECT_PATHS, SESSION_MAKING_PATHS } from "./two-factor-gate";

const BASE = "http://localhost:3000";
const EMAIL = "person@example.com";

// The real Better Auth instance on a throwaway database. Google's token
// endpoint is stubbed; everything else (state, callback, hooks, cookies) is real.
let auth: typeof import("./auth").auth;
let db: typeof import("@/lib/db/client").db;
let schema: typeof import("@/lib/db/schema");

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-2fa-")), "t.db")}`;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  process.env.BETTER_AUTH_URL = BASE;
  process.env.GOOGLE_CLIENT_ID = "google-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  process.env.GITHUB_CLIENT_ID = "github-id";
  process.env.GITHUB_CLIENT_SECRET = "github-secret";
  process.env.APOCRYPHA_TEST_AUTH = "1";
  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  ({ auth } = await import("./auth"));
  await migrate(db, { migrationsFolder: "drizzle" });
});
afterAll(() => vi.unstubAllGlobals());

// ---- helpers ---------------------------------------------------------------

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
let googleEmail = EMAIL;
let googleVerified = true;
let googleSub = "g-123";
const idToken = () =>
  `${b64({ alg: "none" })}.${b64({ sub: googleSub, email: googleEmail, email_verified: googleVerified, name: "Person", iss: "https://accounts.google.com", aud: "google-id" })}.x`;

function stubGoogle() {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return Response.json({ access_token: "at", id_token: idToken(), token_type: "Bearer", expires_in: 3600 });
    if (url.startsWith("https://github.com/login/oauth/access_token"))
      return Response.json({ access_token: "gh", token_type: "bearer", scope: "read:user,user:email" });
    if (url.startsWith("https://api.github.com/user/emails"))
      return Response.json([{ email: githubEmail, primary: true, verified: true }]);
    if (url.startsWith("https://api.github.com/user"))
      return Response.json({ id: githubId, login: "octo", name: "Octo", email: githubEmail, avatar_url: "" });
    return real(input, init);
  });
}

class Jar {
  cookies = new Map<string, string>();
  take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  get header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  has(part: string) {
    return [...this.cookies.keys()].some((k) => k.includes(part));
  }
}

async function call(path: string, jar: Jar, init: { method?: string; body?: object } = {}) {
  const res = await auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", origin: BASE, cookie: jar.header },
      body: init.body ? JSON.stringify(init.body) : undefined,
      redirect: "manual",
    }),
  );
  jar.take(res);
  return res;
}

/** The full browser round trip: start Google sign-in, then come back with a code. */
async function googleSignIn(jar: Jar) {
  const start = await call("/sign-in/social", jar, { body: { provider: "google", callbackURL: "/dashboard" } });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  return call(`/callback/google?code=abc&state=${state}`, jar);
}

function base32(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(uri: string, at = Date.now()) {
  const key = base32(new URL(uri).searchParams.get("secret")!);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

let githubEmail = "farrely.firenza@outlook.com";
let githubId = 4242;

const sessionCount = async () => (await db.select().from(schema.session)).length;

// ---- tests -----------------------------------------------------------------

describe("which paths make a session", () => {
  it("covers provider callbacks and ID-token sign-in, nothing else", () => {
    for (const p of ["/callback/google", "/callback/github", "/oauth2/callback/x", "/sign-in/social"]) expect(SESSION_MAKING_PATHS(p)).toBe(true);
    for (const p of ["/sign-in/email", "/two-factor/verify-totp", "/callback", "/callback/a/b", "/get-session"]) expect(SESSION_MAKING_PATHS(p)).toBe(false);
    expect(OAUTH_REDIRECT_PATHS.test("/sign-in/social")).toBe(false);
  });
});

let enrolledUri = "";
const currentUri = async () => enrolledUri;

describe("google sign-in with and without two-factor", () => {
  const jar = new Jar();
  let uri = "";

  it("signs in straight away while two-factor is off", async () => {
    stubGoogle();
    const res = await googleSignIn(jar);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(jar.has("session_token")).toBe(true);
    expect(await sessionCount()).toBe(1);
  });

  it("enables two-factor from a fresh session, only active after a valid code", async () => {
    const res = await call("/two-factor/enable", jar, { body: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totpURI: string; backupCodes: string[] };
    uri = body.totpURI;
    enrolledUri = uri;
    expect(body.backupCodes.length).toBeGreaterThan(5);
    const [row] = await db.select().from(schema.user).where(eq(schema.user.email, EMAIL));
    expect(row.twoFactorEnabled).toBe(false);

    const bad = await call("/two-factor/verify-totp", jar, { body: { code: "000000" } });
    expect(bad.status).toBe(401);
    const ok = await call("/two-factor/verify-totp", jar, { body: { code: totp(uri) } });
    expect(ok.status).toBe(200);
    const [after] = await db.select().from(schema.user).where(eq(schema.user.email, EMAIL));
    expect(after.twoFactorEnabled).toBe(true);
  });

  it("does NOT create a session on the Google callback once two-factor is on", async () => {
    await call("/sign-out", jar, { body: {} });
    expect(await sessionCount()).toBe(0);

    const res = await googleSignIn(jar);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/two-factor");
    expect(jar.has("session_token")).toBe(false);
    expect(jar.has("two_factor")).toBe(true);
    expect(await sessionCount()).toBe(0);
    // And nothing signed-in-only answers yet.
    const me = await call("/get-session", jar);
    expect(await me.json()).toBeNull();
  });

  it("rejects a wrong code and accepts the right one, then a session exists", async () => {
    const wrong = await call("/two-factor/verify-totp", jar, { body: { code: "111111" } });
    expect(wrong.status).toBe(401);
    expect(await sessionCount()).toBe(0);
    const right = await call("/two-factor/verify-totp", jar, { body: { code: totp(uri) } });
    expect(right.status).toBe(200);
    expect(jar.has("session_token")).toBe(true);
    expect(await sessionCount()).toBe(1);
  });

  it("skips the code on a browser that was told to be remembered", async () => {
    const remembered = new Jar();
    await googleSignIn(remembered);
    const verified = await call("/two-factor/verify-totp", remembered, { body: { code: totp(uri), trustDevice: true } });
    expect(verified.status).toBe(200);
    expect(remembered.has("trust_device")).toBe(true);
    await call("/sign-out", remembered, { body: {} });
    const again = await googleSignIn(remembered);
    expect(again.headers.get("location")).toContain("/dashboard");
    expect(remembered.has("session_token")).toBe(true);
  });
});

describe("changing two-factor needs a recent sign-in", () => {
  it("refuses enable, disable, backup codes and the secret from an old session", async () => {
    // The remembered browser from above signs straight in; its session is then aged by an hour.
    const jar = new Jar();
    const first = await googleSignIn(jar);
    expect(first.headers.get("location")).toContain("/two-factor");
    const trusted = await call("/two-factor/verify-totp", jar, { body: { code: totp(await currentUri()), trustDevice: true } });
    expect(trusted.status).toBe(200);
    await db.update(schema.session).set({ createdAt: new Date(Date.now() - 3_600_000) });

    for (const path of ["/two-factor/enable", "/two-factor/disable", "/two-factor/generate-backup-codes", "/two-factor/get-totp-uri"]) {
      const res = await call(path, jar, { body: {} });
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as { code?: string }).code, path).toBe("RECENT_SIGN_IN_REQUIRED");
    }
  });
});

describe("linking GitHub to a Google account with a different email", () => {
  const GOOGLE_ONLY = "farrely.dev@gmail.com";

  async function signUp(email: string) {
    const jar = new Jar();
    const res = await call("/sign-up/email", jar, { body: { email, password: "test-password-123", name: "Linker" } });
    expect(res.status).toBe(200);
    return jar;
  }
  const linkGithub = async (jar: Jar) => {
    const start = await call("/link-social", jar, { body: { provider: "github", callbackURL: "/settings" } });
    if (start.status !== 200) return { start, done: null };
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    return { start, done: await call(`/callback/github?code=abc&state=${state}`, jar) };
  };
  const accountsOf = async (email: string) => {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    return db.select().from(schema.account).where(eq(schema.account.userId, u.id));
  };

  it("links the other login to the same account, without making a second one", async () => {
    stubGoogle();
    const jar = await signUp(GOOGLE_ONLY);
    const before = (await db.select().from(schema.user)).length;
    const { done } = await linkGithub(jar);
    expect(done!.status).toBe(302);
    expect(done!.headers.get("location")).toContain("/settings");
    expect(done!.headers.get("location")).not.toContain("error");
    expect((await accountsOf(GOOGLE_ONLY)).map((a) => a.providerId).sort()).toEqual(["credential", "github"]);
    expect((await db.select().from(schema.user)).length).toBe(before);
  });

  it("refuses a login that already belongs to a different account", async () => {
    const other = await signUp("someone.else@example.com");
    const { done } = await linkGithub(other);
    expect(done!.headers.get("location")).toContain("error=account_already_linked_to_different_user");
    expect((await accountsOf("someone.else@example.com")).map((a) => a.providerId)).toEqual(["credential"]);
  });

  it("needs a recent sign-in, so a stolen older session cannot attach a stranger's login", async () => {
    githubId = 9999;
    githubEmail = "attacker@example.com";
    const victim = await signUp("victim@example.com");
    await db.update(schema.session).set({ createdAt: new Date(Date.now() - 3_600_000) });
    const { start, done } = await linkGithub(victim);
    expect(start.status).toBe(403);
    expect(done).toBeNull();
    expect((await accountsOf("victim@example.com")).map((a) => a.providerId)).toEqual(["credential"]);
  });
});

describe("signing in with a second provider on an existing email", () => {
  const OWNER = "owner@example.com";
  const reset = () => {
    googleEmail = EMAIL;
    googleVerified = true;
    googleSub = "g-123";
  };
  const googleAccounts = async () => (await db.select().from(schema.account)).filter((a) => a.providerId === "google" && a.accountId === googleSub);

  it("does not link, and does not sign in, when the provider has not verified the address", async () => {
    stubGoogle();
    await call("/sign-up/email", new Jar(), { body: { email: OWNER, password: "test-password-123", name: "Owner" } });
    // The account's own address is verified (made through GitHub, say): only the provider's word is in question.
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.email, OWNER));
    googleEmail = OWNER;
    googleVerified = false;
    googleSub = "g-attacker";
    const jar = new Jar();
    const res = await googleSignIn(jar);
    expect(res.headers.get("location")).toContain("error=");
    expect(jar.has("session_token")).toBe(false);
    expect(await googleAccounts()).toHaveLength(0);
    reset();
  });

  it("links once the provider says the address is verified and the account's own address is too", async () => {
    googleEmail = OWNER;
    googleSub = "g-owner";
    const before = (await db.select().from(schema.user)).length;
    // A local account whose address was never verified is not linked to either, however the provider answers.
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.email, OWNER));
    const refused = await googleSignIn(new Jar());
    expect(refused.headers.get("location")).toContain("error=account_not_linked");
    expect(await googleAccounts()).toHaveLength(0);
    // An account made through GitHub or Google has a verified address.
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.email, OWNER));
    const jar = new Jar();
    const res = await googleSignIn(jar);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(jar.has("session_token")).toBe(true);
    expect(await googleAccounts()).toHaveLength(1);
    expect((await db.select().from(schema.user)).length).toBe(before);
    reset();
  });
});

describe("deleting an organisation over HTTP", () => {
  it("needs a recent sign-in and the exact name, and then removes it", async () => {
    const { createOrganization } = await import("@/lib/workspace/manage");
    const { DELETE } = await import("@/app/api/organizations/[orgId]/route");
    const jar = new Jar();
    await call("/sign-up/email", jar, { body: { email: "boss@example.com", password: "test-password-123", name: "Boss" } });
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, "boss@example.com"));
    const org = await createOrganization(db, u.id, { name: "Gone Soon", projectName: "P", environment: { id: crypto.randomUUID(), name: "dev", wrappedKey: "w" } });
    if (org.status !== "created") throw new Error("setup");
    const del = (name: string) =>
      DELETE(new Request(`${BASE}/api/organizations/${org.orgId}`, { method: "DELETE", headers: { "content-type": "application/json", origin: BASE, cookie: jar.header }, body: JSON.stringify({ name }) }), {
        params: Promise.resolve({ orgId: org.orgId }),
      });
    const exists = async () => (await db.select().from(schema.organization).where(eq(schema.organization.id, org.orgId))).length;

    await db.update(schema.session).set({ createdAt: new Date(Date.now() - 3_600_000) }).where(eq(schema.session.userId, u.id));
    const stale = await del("Gone Soon");
    expect(stale.status).toBe(403);
    expect(((await stale.json()) as { code?: string }).code).toBe("RECENT_SIGN_IN_REQUIRED");
    expect(await exists()).toBe(1);

    await db.update(schema.session).set({ createdAt: new Date() }).where(eq(schema.session.userId, u.id));
    expect((await del("wrong name")).status).toBe(400);
    expect(await exists()).toBe(1);
    expect((await del("Gone Soon")).status).toBe(200);
    expect(await exists()).toBe(0);
  });
});
