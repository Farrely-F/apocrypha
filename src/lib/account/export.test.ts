import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "../audit/store";
import * as schema from "../db/schema";
import { createOrganization } from "../workspace/manage";
import { buildAccountExport } from "./export";

let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-export-")), "t.db")}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.user).values([
    { id: "ann", name: "Ann", email: "ann@example.com" },
    { id: "ben", name: "Ben", email: "ben-private@example.com" },
  ]);
  await db.insert(schema.vault).values({ userId: "ann", publicKey: "v1|x25519|PUB", passphraseBlob: "WRAPPED-PASSPHRASE-BLOB", recoveryBlob: "WRAPPED-RECOVERY-BLOB" });
  await db.insert(schema.account).values({ id: "a1", accountId: "g1", providerId: "google", userId: "ann", accessToken: "PROVIDER-TOKEN", refreshToken: "PROVIDER-REFRESH" });
  await db.insert(schema.session).values({ id: "s1", token: "SESSION-TOKEN", userId: "ann", expiresAt: new Date(Date.now() + 1e6), ipAddress: "203.0.113.5", userAgent: "UA" });
  await db.insert(schema.twoFactor).values({ id: "t1", secret: "TOTP-SECRET", backupCodes: "BACKUP-CODES", userId: "ann" });
  const org = await createOrganization(db, "ben", { name: "Team", projectName: "P", environment: { id: crypto.randomUUID(), name: "dev", wrappedKey: "w" } });
  if (org.status !== "created") throw new Error("setup");
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: org.orgId, userId: "ann", role: "member" });
  await recordAudit(db, { orgId: org.orgId, actorId: "ben", type: "member.joined", targetUserId: "ann" });
  await recordAudit(db, { orgId: org.orgId, actorId: "ben", type: "secret.created" });
});

describe("account export", () => {
  it("gives a person what is held about them", async () => {
    const x = (await buildAccountExport(db, "ann"))!;
    expect(x.profile).toMatchObject({ id: "ann", name: "Ann", email: "ann@example.com" });
    expect(x.signIn.providers.map((p) => p.provider)).toEqual(["google"]);
    expect(x.vault?.publicKey).toBe("v1|x25519|PUB");
    expect(x.sessions).toHaveLength(1);
    expect(x.memberships.map((m) => [m.organisation, m.role])).toEqual([["Team", "member"]]);
    expect(x.auditEvents.map((e) => e.type)).toEqual(["member.joined"]); // only events about her, not the whole log
  });

  it("leaves out other people's details, key material and tokens", async () => {
    const text = JSON.stringify(await buildAccountExport(db, "ann"));
    for (const secret of ["ben-private@example.com", "WRAPPED-PASSPHRASE-BLOB", "WRAPPED-RECOVERY-BLOB", "PROVIDER-TOKEN", "PROVIDER-REFRESH", "SESSION-TOKEN", "TOTP-SECRET", "BACKUP-CODES"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("is null for an account that does not exist", async () => {
    expect(await buildAccountExport(db, "nobody")).toBeNull();
  });
});
