import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import type { VaultPayload } from "./payload";

type Db = LibSQLDatabase<typeof schema>;

export async function getVaultRecord(db: Db, userId: string) {
  const [row] = await db.select().from(schema.vault).where(eq(schema.vault.userId, userId)).limit(1);
  return row ?? null;
}

/** One vault per user. A second attempt never overwrites the first. */
export async function createVaultRecord(
  db: Db,
  userId: string,
  payload: VaultPayload,
): Promise<"created" | "exists"> {
  const inserted = await db
    .insert(schema.vault)
    .values({ userId, ...payload })
    .onConflictDoNothing()
    .returning({ userId: schema.vault.userId });
  return inserted.length > 0 ? "created" : "exists";
}
