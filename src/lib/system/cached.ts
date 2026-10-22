import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { computeSystemOverview, type SystemOverview } from "./overview";

type Db = LibSQLDatabase<typeof schema>;

const KEY = "overview";

/** How long the system-wide numbers are reused before they are counted again. */
export const OVERVIEW_TTL_MS = 5 * 60_000;

/**
 * The system-wide aggregates, counted at most every five minutes however often the page is opened: they scan whole
 * tables, and a hosted database bills by rows read.
 *
 * The saved copy is a row in the database, not memory and not Next's `use cache`. Next's default cache lives in one
 * server instance; on a serverless host the next request is usually a different instance, so the saving would not
 * hold and the Refresh button would clear only one of them. A row is shared by every instance and survives restarts.
 * It holds counts and dates only, and is only read or written after the administrator check.
 */
export async function getSystemOverview(db: Db, now = Date.now()): Promise<SystemOverview> {
  const [row] = await db.select().from(schema.systemSnapshot).where(eq(schema.systemSnapshot.key, KEY)).limit(1);
  if (row && now - row.computedAt < OVERVIEW_TTL_MS && now >= row.computedAt) {
    try {
      return JSON.parse(row.payload) as SystemOverview;
    } catch {
      /* a damaged copy is just counted again */
    }
  }
  const fresh = await computeSystemOverview(db, now);
  const payload = JSON.stringify(fresh);
  await db.insert(schema.systemSnapshot).values({ key: KEY, computedAt: now, payload }).onConflictDoUpdate({ target: schema.systemSnapshot.key, set: { computedAt: now, payload } });
  return fresh;
}

/** The Refresh button: forget the saved copy so the next view counts again, on every instance. */
export async function expireOverview(db: Db): Promise<void> {
  await db.delete(schema.systemSnapshot).where(eq(schema.systemSnapshot.key, KEY));
}
