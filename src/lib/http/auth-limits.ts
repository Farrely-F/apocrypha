import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "../db/schema";
import { clientKey, limited } from "./ratelimit";

type Db = LibSQLDatabase<typeof schema>;
type Rule = { name: string; limit: number; windowMs: number };

/**
 * Per-address limits in front of the sign-in routes. Better Auth has its own limiter, but it keys on the first
 * address in X-Forwarded-For, which a client can write; this one counts in from the right by the number of
 * proxies we trust (TRUSTED_PROXY_HOPS), in the database, so it holds across restarts.
 *
 * Code guessing is what matters most: a two-factor code is six digits, and the plugin also locks the account
 * after repeated failures, so this only has to stop one address from spreading guesses.
 */
const RULES: { match: RegExp; rule: Rule }[] = [
  { match: /^\/api\/auth\/two-factor\/(verify|send)/, rule: { name: "second-factor", limit: 10, windowMs: 60_000 } },
  { match: /^\/api\/auth\/(sign-in|sign-up|request-password-reset|reset-password|magic-link)/, rule: { name: "sign-in", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/auth\/callback\//, rule: { name: "provider-callback", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/auth\/(link-social|unlink-account|two-factor|revoke|update-user|delete-user|change-)/, rule: { name: "account", limit: 30, windowMs: 60_000 } },
];

/** Anything else that changes state. Reads (the session check the client polls) are not limited. */
const FALLBACK: Rule = { name: "auth", limit: 240, windowMs: 60_000 };

export function authRule(method: string, pathname: string): Rule | null {
  const hit = RULES.find((r) => r.match.test(pathname));
  if (hit) return hit.rule;
  return method === "GET" || method === "HEAD" ? null : FALLBACK;
}

/**
 * A 429 response when this address is over its limit for this kind of request, otherwise null.
 *
 * Only an address our own proxy appended is believed (see `clientKey`). When there is none (no proxy in front,
 * or TRUSTED_PROXY_HOPS=0) there is no per-address limit, and deliberately no shared bucket in its place: a
 * shared bucket lets one client lock everyone else out of signing in. What bounds code guessing then does not
 * depend on the client's address or headers at all: the two-factor plugin counts wrong codes per pending
 * challenge (a server-issued, signed cookie it validates) and per account, and locks the account (see
 * `accountLockout` in auth.ts, and the tests that drive it).
 */
export async function limitAuth(db: Db, request: Request): Promise<Response | null> {
  const rule = authRule(request.method, new URL(request.url).pathname);
  const ip = clientKey(request);
  if (!rule || !ip) return null;
  return limited(db, `auth-${rule.name}:${ip}`, rule.limit, rule.windowMs);
}
