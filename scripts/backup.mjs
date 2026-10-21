// Write a consistent copy of the database while the app keeps running.
//   node scripts/backup.mjs /data/backups/apocrypha-2026-10-21.db
// Uses SQLite's VACUUM INTO, which snapshots a single transaction (unlike copying the file during a write).
// The backup contains ciphertext only, but treat it like the live database: it is every user's wrapped keys.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL || "file:./data/apocrypha.db";
const target = process.argv[2];
if (!url.startsWith("file:")) {
  console.error("backup: only for file: databases. For Turso, use its own backup and branching tools.");
  process.exit(2);
}
if (!target) {
  console.error("usage: node scripts/backup.mjs <destination-file.db>");
  process.exit(2);
}
const dest = resolve(target);
if (existsSync(dest)) {
  console.error(`backup: ${dest} already exists. Pick a new name; nothing was overwritten.`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });

const client = createClient({ url });
try {
  await client.execute({ sql: "VACUUM INTO ?", args: [dest] });
  console.log(`backup written to ${dest}`);
} catch (error) {
  console.error("backup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.close();
}
