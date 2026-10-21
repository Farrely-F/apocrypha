import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { insertPersonalWorkspace, type WorkspaceIds } from "../workspace/queries";
import type { VaultPayload } from "./payload";

type Db = LibSQLDatabase<typeof schema>;

export async function getVaultRecord(db: Db, userId: string) {
  const [row] = await db.select().from(schema.vault).where(eq(schema.vault.userId, userId)).limit(1);
  return row ?? null;
}

class VaultExists extends Error {}

export type CreateVaultResult = ({ status: "created" } & WorkspaceIds) | { status: "exists" };

/**
 * Create the user's vault together with their personal org, membership,
 * project, environment and environment-key grant, in ONE transaction: either
 * all of it exists afterwards or none of it. One vault per user; a second
 * attempt changes nothing. Any other failure (for example an environment id
 * that is already taken) rolls everything back and is rethrown.
 */
export async function createVaultRecord(
  db: Db,
  userId: string,
  payload: VaultPayload,
): Promise<CreateVaultResult> {
  const { workspace, ...vault } = payload;
  try {
    return await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.vault)
        .values({ userId, ...vault })
        .onConflictDoNothing()
        .returning({ userId: schema.vault.userId });
      if (inserted.length === 0) throw new VaultExists();
      const ids = await insertPersonalWorkspace(tx, userId, workspace);
      return { status: "created" as const, ...ids };
    });
  } catch (error) {
    if (error instanceof VaultExists) return { status: "exists" };
    throw error;
  }
}

/**
 * Swap the passphrase blob only if it is still the one the client started from, so a stale tab
 * or a second device cannot silently overwrite a newer passphrase. The public key never changes here.
 */
export async function replacePassphraseBlob(db: Db, userId: string, previousBlob: string, passphraseBlob: string) {
  const done = await db
    .update(schema.vault)
    .set({ passphraseBlob })
    .where(and(eq(schema.vault.userId, userId), eq(schema.vault.passphraseBlob, previousBlob)))
    .returning({ userId: schema.vault.userId });
  return done.length === 1;
}
