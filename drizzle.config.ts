import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read Next's env files; load them the same way Next does.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: fine
  }
}

const url = process.env.DATABASE_URL || "file:./data/apocrypha.db";

// libsql will not create missing parent directories for a local file.
if (url.startsWith("file:")) {
  mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
}

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
