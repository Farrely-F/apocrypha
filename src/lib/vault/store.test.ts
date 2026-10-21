import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createVaultRecord, getVaultRecord } from "./store";

const payload = {
  publicKey: "v1|x25519|AAAA",
  passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
  recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
};

let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "apocrypha-vault-"));
  db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["u1", "u2"]) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  }
});

describe("vault store", () => {
  it("has no vault before creation", async () => {
    expect(await getVaultRecord(db, "u1")).toBeNull();
  });

  it("creates a vault once per user", async () => {
    expect(await createVaultRecord(db, "u1", payload)).toBe("created");
    expect(await createVaultRecord(db, "u1", { ...payload, publicKey: "v1|x25519|BBBB" })).toBe(
      "exists",
    );
    const row = await getVaultRecord(db, "u1");
    expect(row?.publicKey).toBe(payload.publicKey);
    expect(row?.passphraseBlob).toBe(payload.passphraseBlob);
  });

  it("keeps vaults separate per user", async () => {
    expect(await getVaultRecord(db, "u2")).toBeNull();
    expect(await createVaultRecord(db, "u2", payload)).toBe("created");
  });

  it("removes the vault with its user", async () => {
    await db.delete(schema.user).where(eq(schema.user.id, "u2"));
    expect(await getVaultRecord(db, "u2")).toBeNull();
  });
});
