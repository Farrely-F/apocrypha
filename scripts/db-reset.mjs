// Delete the local SQLite database and migrate a fresh one, for testing from
// zero. Only ever touches a local file: DATABASE_URL inside this project; a
// remote (Turso) database is refused. Pass --force to allow a path outside the
// project.
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { relative, resolve, isAbsolute } from "node:path";

// Same env files, same order as Next and drizzle.config.ts. Variables already
// set in the shell win.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: fine
  }
}

const force = process.argv.includes("--force");
const url = process.env.DATABASE_URL || "file:./data/apocrypha.db";

function refuse(reason) {
  console.error(`db:reset refused: ${reason}`);
  process.exit(1);
}

if (!url.startsWith("file:")) {
  refuse("DATABASE_URL is not a local file: URL, so this is not a local database.");
}
const raw = url.slice("file:".length).split("?")[0];
if (raw === "" || raw === ":memory:") refuse("DATABASE_URL points at no file.");

const file = resolve(process.cwd(), raw);
const rel = relative(process.cwd(), file);
const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
if (!inside && !force) {
  refuse(`${file} is outside this project. Re-run with --force if that is really what you want.`);
}

const removed = [];
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const target = file + suffix;
  if (existsSync(target)) {
    rmSync(target);
    removed.push(target);
  }
}
console.log(
  removed.length
    ? `Deleted:\n${removed.map((p) => `  ${p}`).join("\n")}`
    : `No database at ${file}; nothing to delete.`,
);

const migrate = spawnSync("./node_modules/.bin/drizzle-kit", ["migrate"], { stdio: "inherit" });
if (migrate.status !== 0) {
  console.error("db:reset: migration failed.");
  process.exit(migrate.status ?? 1);
}

console.log(`
Fresh database ready at ${file}.

Now:
  1. Restart \`npm run dev\`. The running server still holds the old file open.
  2. Your browser session is gone with the old database, so you will be signed out.
  3. Optional: clear the old local key (DevTools > Application > Storage > Clear
     site data, or delete the "apocrypha-keystore" IndexedDB). The app already
     ignores a key that belongs to a different account.`);
