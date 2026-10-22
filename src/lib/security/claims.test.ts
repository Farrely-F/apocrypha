/**
 * The limits the landing page states, each checked. If a sentence on that page stops being true, a test here
 * fails. `docs/VERIFY.md` says how to run them and what each one proves.
 */
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { CryptoError, createVault, unlockVault, unlockVaultWithRecoveryKey } from "../crypto";
import { formatRecoveryKey } from "../crypto/vault";
import * as schema from "../db/schema";
import { planRemoval, removeMember } from "../members/store";
import { createVaultRecord } from "../vault/store";
import { createEnvironment } from "../workspace/manage";
import { isStrictRoute, strictCsp } from "./csp";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const files = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : [],
  );

describe('"Not independently audited. The crypto is checked against published test vectors and has had a review by an AI assistant, which is not an outside audit."', () => {
  it("says so where people look: the README, the landing page, the sign-in page", () => {
    expect(read("README.md").slice(0, 700).toLowerCase()).toContain("unaudited");
    expect(read("src/app/page.tsx")).toContain("Not independently audited.");
    expect(read("src/app/page.tsx")).toContain("not an outside audit");
    expect(read("src/app/(auth)/sign-in/sign-in-screen.tsx").toLowerCase()).toContain("unaudited");
  });
  it("does not call its own review an audit: the review document says what it is and is not, and the landing page links it", () => {
    const review = read("docs/crypto-review.md");
    expect(review).toContain("self-review, not an audit");
    expect(review).toContain("not independent");
    expect(read("src/app/page.tsx")).toContain("docs/crypto-review.md");
    expect(read("src/app/page.tsx")).not.toMatch(/\baudited by\b|\bpassed an audit\b|\bsecurity audit(ed)?\b/i);
  });
  it("lists the limits it found, and each is pinned by a test that runs", () => {
    const review = read("docs/crypto-review.md");
    for (const limit of ["not authenticated", "trusted", "strength estimate", "Lengths", "`deleted` flag"]) expect(review).toContain(limit);
    const pinned = read("src/lib/crypto/limits.test.ts");
    for (const title of ["grants are not authenticated", "ciphertext length reveals plaintext length", "the passphrase estimate"]) expect(pinned).toContain(title);
  });
  it("is honest about the vectors: the known-answer tests cite the published sources they use", () => {
    const kat = read("src/lib/crypto/kat.test.ts");
    for (const source of ["RFC 7748", "RFC 5869", "GCM spec", "Argon2 reference"]) expect(kat).toContain(source);
    expect(read("docs/crypto.md")).toMatch(/[0-9a-f]{32}/);
  });
});

describe('"We serve the code that decrypts. ... A strict CSP and open source shrink that risk. They don\'t remove it."', () => {
  it("keeps the caveat: it does not claim the policy removes the risk", () => {
    expect(read("src/app/page.tsx")).toMatch(/They don.t remove it/);
  });
  it("is strict where the passphrase and keys are: scripts run only with the per-request nonce, and the page talks only to us", () => {
    for (const path of ["/vault/new", "/vault/reset", "/dashboard", "/sign-in", "/two-factor", "/s/x", "/join/x"]) expect(isStrictRoute(path), path).toBe(true);
    const csp = strictCsp({ nonce: "N" });
    const script = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp.split("; ")).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/https?:/);
  });
});

describe('"Removing someone doesn\'t make them forget. Rotate the secrets themselves at their source. We\'ll list which ones the person could read."', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let orgId: string;
  const envs: { id: string; name: string }[] = [];
  const PUB = "v1|x25519|AAAA";
  const wrapped = (t: string) => `v1|x25519-hkdf-a256gcm|${"E".repeat(43)}|${"C".repeat(63)}${t}`;

  beforeAll(async () => {
    db = drizzle(createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), "apocrypha-claims-")), "t.db")}` }), { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    for (const id of ["owner", "leaver"]) {
      await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
    }
    const first = await createVaultRecord(db, "owner", {
      publicKey: PUB,
      passphraseBlob: "v1|argon2id-a256gcm|x25519|m=1,t=1,p=1|s|i|c",
      recoveryBlob: "v1|recovery-a256gcm|x25519|i|c",
      workspace: { envId: crypto.randomUUID(), wrappedKey: wrapped("A"), orgName: "Org", projectName: "P", environmentName: "dev" },
    });
    if (first.status !== "created") throw new Error("setup");
    orgId = first.orgId;
    envs.push({ id: first.envId, name: "dev" });
    await db.insert(schema.vault).values({ userId: "leaver", publicKey: PUB, passphraseBlob: "p", recoveryBlob: "r" });
    await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: "leaver", role: "member" });
    for (const name of ["staging", "prod"]) {
      const e = { id: crypto.randomUUID(), name, wrappedKey: wrapped("B") };
      const made = await createEnvironment(db, "owner", first.projectId, e);
      if (made.status !== "created") throw new Error("setup env");
      envs.push({ id: e.id, name });
    }
    // the leaver can open dev and prod, not staging
    for (const e of [envs[0], envs[2]]) {
      await db.insert(schema.environmentKeyGrant).values({ envId: e.id, principalType: "user", principalId: "leaver", keyVersion: 1, wrappedKey: wrapped("L") });
    }
  });

  it("lists exactly the environments the person could read, so the rest can be rotated at the source", async () => {
    const plan = await planRemoval(db, "owner", orgId, "leaver");
    if (plan.status !== "ok") throw new Error(plan.status);
    expect(plan.environments.map((e) => e.envName).sort()).toEqual(["dev", "prod"]);
  });

  it("cuts them off from everything written afterwards: a new key version they are never given", async () => {
    const plan = await planRemoval(db, "owner", orgId, "leaver");
    if (plan.status !== "ok") throw new Error(plan.status);
    const rotations = plan.environments.map((e) => ({ envId: e.envId, grants: [{ userId: "owner", wrappedKey: wrapped("N") }] }));
    const r = await removeMember(db, "owner", orgId, "leaver", rotations);
    expect(r.status).toBe("removed");
    const left = await db.select().from(schema.environmentKeyGrant);
    expect(left.some((g) => g.principalId === "leaver")).toBe(false);
    const dev = left.filter((g) => g.envId === envs[0].id && g.principalId === "owner").map((g) => g.keyVersion).sort();
    expect(dev).toEqual([1, 2]);
    // What they already read stays with them: nothing on the server can take it back, which is why the
    // list above exists.
  });
});

describe('"Lose the passphrase and the recovery key, lose the data. Nobody can recover a personal vault for you, including us."', () => {
  const FAST = { memoryKiB: 8192, iterations: 1, parallelism: 1 };
  const SERVER_SECRET = "server-side-secret-that-signs-sessions-0123456789";

  it("keeps nothing on the server that opens a vault: the table holds a public key and two wrapped blobs", () => {
    expect(Object.keys(getTableColumns(schema.vault)).sort()).toEqual(["createdAt", "passphraseBlob", "publicKey", "recoveryBlob", "updatedAt", "userId"]);
  });

  it("reads no server secret when it unwraps keys: the browser-side key code only sees NEXT_PUBLIC_ settings, which ship to every browser anyway", () => {
    for (const f of [...files("src/lib/crypto"), "src/lib/vault/keystore.ts", "src/lib/vault/unlocked.ts", "src/lib/vault/passphrase-client.ts"]) {
      expect(read(f), f).not.toMatch(/process\.env\.(?!NEXT_PUBLIC_)|process\.env\[|BETTER_AUTH_SECRET/);
    }
  });

  it("opens only with the passphrase or the recovery key, and nothing else the server could hold", async () => {
    const pass = "correct horse battery staple 77";
    const vault = await createVault(pass, { params: FAST });
    // the right ones open it
    await expect(unlockVault(vault.passphraseBlob, pass)).resolves.toBeTruthy();
    await expect(unlockVaultWithRecoveryKey(vault.recoveryBlob, vault.recoveryKey)).resolves.toBeTruthy();
    // nothing else does: a wrong passphrase, the server's own secret, another vault's recovery key
    for (const wrong of ["wrong passphrase", SERVER_SECRET, pass.toUpperCase(), vault.recoveryKey]) {
      await expect(unlockVault(vault.passphraseBlob, wrong), wrong).rejects.toBeInstanceOf(CryptoError);
    }
    const other = await createVault("another passphrase entirely 12", { params: FAST });
    const recovery = (k: string) => unlockVaultWithRecoveryKey(vault.recoveryBlob, k);
    await expect(recovery(other.recoveryKey)).rejects.toBeInstanceOf(CryptoError);
    await expect(recovery(formatRecoveryKey(new Uint8Array(32)))).rejects.toBeInstanceOf(CryptoError);
    await expect(recovery(SERVER_SECRET)).rejects.toBeInstanceOf(CryptoError);
  });
});
