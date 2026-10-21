import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * DATABASE_URL accepts:
 *   file:./data/apocrypha.db   local / self-hosted (default)
 *   libsql://<db>.turso.io     Turso, requires DATABASE_AUTH_TOKEN
 */
export const DEFAULT_DATABASE_URL = "file:./data/apocrypha.db";

function ensureLocalDirectory(url: string) {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length);
  if (path === "" || path === ":memory:") return;
  mkdirSync(dirname(path), { recursive: true });
}

const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

ensureLocalDirectory(url);

export const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });
