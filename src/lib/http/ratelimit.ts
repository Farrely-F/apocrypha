import { lt, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";

type Db = LibSQLDatabase<typeof schema>;

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window counter in the database, so it holds across server instances and restarts. One atomic
 * upsert both counts the attempt and reads the count, so concurrent requests cannot slip past the limit.
 */
export async function hit(db: Db, key: string, limit: number, windowMs: number, now = Date.now()): Promise<LimitResult> {
  const window = Math.floor(now / windowMs);
  const expiresAt = (window + 1) * windowMs;
  const [row] = await db
    .insert(schema.rateLimit)
    .values({ key, window, count: 1, expiresAt })
    .onConflictDoUpdate({ target: [schema.rateLimit.key, schema.rateLimit.window], set: { count: sql`${schema.rateLimit.count} + 1` } })
    .returning({ count: schema.rateLimit.count });
  // Tidy finished windows now and then. By absolute expiry, so a short window can never delete a long one that is still live.
  if (Math.random() < 0.01) {
    await db.delete(schema.rateLimit).where(lt(schema.rateLimit.expiresAt, now)).catch(() => null);
  }
  if (row.count <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
}

/**
 * The client address as added by our own reverse proxies, or null when it cannot be trusted. A client
 * can put anything at the front of X-Forwarded-For, so we count `hops` entries in from the right (the
 * ones our proxies appended). With hops set to 0, or fewer entries than hops (no proxy in front), there
 * is no trusted source and this returns null; callers that must still be bounded then use a shared bucket.
 */
export function clientKey(request: Request, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  if (!Number.isInteger(hops) || hops < 1) return null;
  const parts = (request.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  // No X-Real-IP fallback: without a proxy in front, any client header is the client's own word.
  return parts.length >= hops ? parts[parts.length - hops] : null;
}

export const tooMany = (retryAfterSeconds: number) =>
  Response.json({ error: "Too many attempts. Wait a moment and try again." }, { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "private, no-store" } });

/** Returns a 429 response when the key is over its limit, otherwise null. A null key means "nothing trustworthy to limit by". */
export async function limited(db: Db, key: string | null, limit: number, windowMs: number): Promise<Response | null> {
  if (!key) return null;
  const r = await hit(db, key, limit, windowMs);
  return r.ok ? null : tooMany(r.retryAfterSeconds);
}

/** A signed-in client that writes in a loop (a script, a stuck retry) is slowed down; ordinary use is far below this. */
export const limitWrites = (db: Db, userId: string) => limited(db, `write:${userId}`, 300, 60_000);
