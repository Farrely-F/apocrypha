import { and, lt, sql } from "drizzle-orm";
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
  const [row] = await db
    .insert(schema.rateLimit)
    .values({ key, window, count: 1 })
    .onConflictDoUpdate({ target: [schema.rateLimit.key, schema.rateLimit.window], set: { count: sql`${schema.rateLimit.count} + 1` } })
    .returning({ count: schema.rateLimit.count });
  // Tidy old windows now and then; a failure here must never block a request.
  if (Math.random() < 0.01) {
    await db.delete(schema.rateLimit).where(and(lt(schema.rateLimit.window, window - 1))).catch(() => null);
  }
  if (row.count <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000)) };
}

/** Where a request came from, as far as a proxy tells us. Only a defence in depth: the header can be forged. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || "unknown";
}

export const tooMany = (retryAfterSeconds: number) =>
  Response.json({ error: "Too many attempts. Wait a moment and try again." }, { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "private, no-store" } });

/** Returns a 429 response when the key is over its limit, otherwise null. */
export async function limited(db: Db, key: string, limit: number, windowMs: number): Promise<Response | null> {
  const r = await hit(db, key, limit, windowMs);
  return r.ok ? null : tooMany(r.retryAfterSeconds);
}
