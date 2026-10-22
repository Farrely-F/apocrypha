import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("imports nothing from React, Next or the rest of the app", () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), "utf8");
    const specifiers = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const s of specifiers) {
      expect(s, `${f} imports ${s}`).toMatch(/^(\.\/|hash-wasm$|@noble\/curves\/)/);
    }
  }
});
