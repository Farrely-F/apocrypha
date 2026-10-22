import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "../db/schema";
import { createHash } from "node:crypto";
import { clientKey, limited } from "./ratelimit";

type Db = LibSQLDatabase<typeof schema>;
type Rule = { name: string; limit: number; windowMs: number; globalLimit: number };

/**
 * Per-address limits in front of the sign-in routes. Better Auth has its own limiter, but it keys on the first
 * address in X-Forwarded-For, which a client can write; this one counts in from the right by the number of
 * proxies we trust (TRUSTED_PROXY_HOPS), in the database, so it holds across restarts.
 *
 * Code guessing is what matters most: a two-factor code is six digits, and the plugin also locks the account
 * after repeated failures, so this only has to stop one address from spreading guesses.
 */
const RULES: { match: RegExp; rule: Rule }[] = [
  { match: /^\/api\/auth\/two-factor\/(verify|send)/, rule: { name: "second-factor", limit: 10, windowMs: 60_000, globalLimit: 120 } },
  { match: /^\/api\/auth\/(sign-in|sign-up|request-password-reset|reset-password|magic-link)/, rule: { name: "sign-in", limit: 20, windowMs: 60_000, globalLimit: 300 } },
  { match: /^\/api\/auth\/callback\//, rule: { name: "provider-callback", limit: 30, windowMs: 60_000, globalLimit: 300 } },
  { match: /^\/api\/auth\/(link-social|unlink-account|two-factor|revoke|update-user|delete-user|change-)/, rule: { name: "account", limit: 30, windowMs: 60_000, globalLimit: 300 } },
];

/** Anything else that changes state. Reads (the session check the client polls) are not limited. */
const FALLBACK: Rule = { name: "auth", limit: 240, windowMs: 60_000, globalLimit: 1200 };

export function authRule(method: string, pathname: string): Rule | null {
  const hit = RULES.find((r) => r.match.test(pathname));
  if (hit) return hit.rule;
  return method === "GET" || method === "HEAD" ? null : FALLBACK;
}

/**
 * The pending second-factor challenge this request answers, as a bucket name. The challenge cookie is issued by
 * the server after the first factor, so a guesser cannot mint new ones for free: limiting per challenge bounds
 * guesses however many addresses they come from or whatever headers they send. (A made-up cookie cannot be
 * guessed against: it fails before any code is checked.)
 */
export function challengeBucket(request: Request): string | null {
  const m = /(?:^|;\s*)(?:__Secure-)?[\w.-]*two_factor=([^;]+)/.exec(request.headers.get("cookie") ?? "");
  return m ? `auth-challenge:${createHash("sha256").update(m[1]).digest("hex").slice(0, 32)}` : null;
}

/**
 * A 429 response when this request is over its limit, otherwise null. Per address when our proxy tells us the
 * address; otherwise one shared bucket per kind of request, much higher, so abuse is still bounded when there is
 * nothing trustworthy to count by (no proxy in front, or TRUSTED_PROXY_HOPS=0) instead of being skipped. Code
 * guessing is also counted per pending challenge.
 */
export async function limitAuth(db: Db, request: Request): Promise<Response | null> {
  const rule = authRule(request.method, new URL(request.url).pathname);
  if (!rule) return null;
  const ip = clientKey(request);
  const refused = await limited(db, `auth-${rule.name}:${ip ?? "untrusted"}`, ip ? rule.limit : rule.globalLimit, rule.windowMs);
  if (refused) return refused;
  if (rule.name === "second-factor") {
    const bucket = challengeBucket(request);
    if (bucket) return limited(db, bucket, rule.limit, rule.windowMs);
  }
  return null;
}
