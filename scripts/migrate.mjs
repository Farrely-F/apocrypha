// Apply database migrations. Runs on container start (see docker-entrypoint.sh) and works the same for
// a local `file:` database or a libsql:// (Turso) one. Safe to run on every boot: applied migrations are skipped.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL || "file:./data/apocrypha.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
const folder = process.env.MIGRATIONS_DIR || "drizzle";

if (url.startsWith("file:")) {
  const path = url.slice("file:".length);
  if (path && path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
}

const client = createClient({ url, authToken });
try {
  await migrate(drizzle(client), { migrationsFolder: folder });
  console.log("migrations: up to date");
} catch (error) {
  console.error("migrations failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.close();
}
