import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { checkPassphraseBlob } from "./payload";
import { createVaultRecord, getVaultRecord, replacePassphraseBlob } from "./store";

const blob = (m = 19456, t = 2) => `v1|argon2id-a256gcm|x25519|m=${m},t=${t},p=1|${"s".repeat(22)}|${"i".repeat(16)}|${"c".repeat(60)}`;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-pw-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.user).values({ id: "u1", name: "u1", email: "u1@example.com" });
  await createVaultRecord(db, "u1", {
    publicKey: "v1|x25519|AAAA",
    passphraseBlob: blob(),
    recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
    workspace: { envId: crypto.randomUUID(), wrappedKey: "w", orgName: "O", projectName: "P", environmentName: "dev" },
  });
});

describe("passphrase blob", () => {
  it("must be well formed and above the Argon2 floor", () => {
    expect(checkPassphraseBlob(blob(), "x25519")).toBeNull();
    expect(checkPassphraseBlob(blob(1024, 1), "x25519")).toMatch(/below the minimum/);
    expect(checkPassphraseBlob(blob(), "p256")).toMatch(/not a valid vault blob/);
    expect(checkPassphraseBlob("nope", "x25519")).toMatch(/not a valid vault blob/);
  });

  it("is replaced only from the blob the client started from", async () => {
    const first = (await getVaultRecord(db, "u1"))!.passphraseBlob;
    const next = blob(19456, 3);
    expect(await replacePassphraseBlob(db, "u1", first, next)).toBe(true);
    // a second tab still holding the old blob must not overwrite the newer one
    expect(await replacePassphraseBlob(db, "u1", first, blob(19456, 4))).toBe(false);
    expect((await getVaultRecord(db, "u1"))!.passphraseBlob).toBe(next);
    expect(await replacePassphraseBlob(db, "nobody", next, blob())).toBe(false);
  });
});
