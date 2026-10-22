import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { clientKey, hit } from "./ratelimit";

let db: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-rl-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
});

describe("rate limit", () => {
  it("allows up to the limit in a window, then refuses with a retry time", async () => {
    const t = 1_000_000_000;
    for (let i = 0; i < 3; i++) expect((await hit(db, "k", 3, 60_000, t)).ok).toBe(true);
    const over = await hit(db, "k", 3, 60_000, t + 5_000);
    expect(over).toMatchObject({ ok: false });
    if (!over.ok) expect(over.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("starts a fresh window later and keeps keys apart", async () => {
    const t = 2_000_000_000;
    await hit(db, "a", 1, 60_000, t);
    expect((await hit(db, "a", 1, 60_000, t)).ok).toBe(false);
    expect((await hit(db, "b", 1, 60_000, t)).ok).toBe(true);
    expect((await hit(db, "a", 1, 60_000, t + 61_000)).ok).toBe(true);
  });

  it("counts concurrent attempts exactly", async () => {
    const t = 3_000_000_000;
    const results = await Promise.all(Array.from({ length: 10 }, () => hit(db, "race", 4, 60_000, t)));
    expect(results.filter((r) => r.ok)).toHaveLength(4);
  });

  it("counts proxy hops from the right, so a forged first entry changes nothing", () => {
    const req = (xff?: string) => new Request("http://x", { headers: xff ? { "x-forwarded-for": xff } : {} });
    expect(clientKey(req("6.6.6.6, 1.2.3.4"), 1)).toBe("1.2.3.4"); // the client lied at the front; the proxy appended the real address
    expect(clientKey(req("6.6.6.6, 1.2.3.4, 10.0.0.1"), 2)).toBe("1.2.3.4");
    expect(clientKey(req(), 1)).toBeNull(); // no header: no shared "unknown" bucket
    // With no proxy in front, X-Real-IP is only the client's word, so it is never believed.
    const spoof = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientKey(spoof, 1)).toBeNull();
    const short = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" } });
    expect(clientKey(short, 2)).toBeNull(); // fewer entries than trusted hops: not trusted either
    expect(clientKey(req("1.2.3.4"), 0)).toBeNull(); // no trusted proxy configured: ignore the header entirely
  });

  it("a short window never deletes a live long window", async () => {
    const t = 4_000_000_000;
    await hit(db, "hourly", 2, 3_600_000, t);
    await hit(db, "hourly", 2, 3_600_000, t);
    const spy = Math.random;
    Math.random = () => 0; // force the cleanup branch on every call
    try {
      for (let i = 0; i < 3; i++) await hit(db, `minute-${i}`, 5, 60_000, t + 10_000);
    } finally {
      Math.random = spy;
    }
    expect((await hit(db, "hourly", 2, 3_600_000, t + 20_000)).ok).toBe(false); // the third hourly attempt is still counted
  });
});
