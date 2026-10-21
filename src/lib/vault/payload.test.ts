import { beforeAll, describe, expect, it } from "vitest";
import { createVault, generateEnvironmentKey, wrapEnvironmentKey } from "../crypto";
import { MIN_ARGON2, parseVaultPayload } from "./payload";

type Good = {
  publicKey: string;
  passphraseBlob: string;
  recoveryBlob: string;
  workspace: {
    envId: string;
    wrappedKey: string;
    orgName: string;
    projectName: string;
    environmentName: string;
  };
};

let good: Good;
let weak: Good;

async function build(params?: { memoryKiB: number; iterations: number; parallelism: number }) {
  const v = await createVault("correct horse battery staple", params ? { params } : undefined);
  const envId = crypto.randomUUID();
  const wrappedKey = await wrapEnvironmentKey(generateEnvironmentKey(), v.keyPair.publicKey, {
    envId,
    keyVersion: 1,
  });
  return {
    publicKey: v.keyPair.publicKey,
    passphraseBlob: v.passphraseBlob,
    recoveryBlob: v.recoveryBlob,
    workspace: {
      envId,
      wrappedKey,
      orgName: "Personal",
      projectName: "First project",
      environmentName: "dev",
    },
  };
}

beforeAll(async () => {
  good = await build();
  weak = await build({ memoryKiB: 8192, iterations: 1, parallelism: 1 });
});

const withWorkspace = (patch: Record<string, unknown>) => ({
  ...good,
  workspace: { ...good.workspace, ...patch },
});

describe("parseVaultPayload", () => {
  it("accepts what createVault and the client workspace step produce", () => {
    const r = parseVaultPayload(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(good);
  });

  it("rejects non-objects and missing fields", () => {
    for (const bad of [null, undefined, "x", 1, [], {}]) {
      expect(parseVaultPayload(bad).ok).toBe(false);
    }
    for (const k of Object.keys(good)) {
      const { [k as keyof typeof good]: _drop, ...rest } = good;
      void _drop;
      expect(parseVaultPayload(rest).ok).toBe(false);
    }
  });

  it("rejects extra fields, so a stray private key is never accepted", () => {
    expect(parseVaultPayload({ ...good, privateKey: "x" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, recoveryKey: "x" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, environmentKey: "x" }).ok).toBe(false);
  });

  it("rejects wrong types and oversize values", () => {
    expect(parseVaultPayload({ ...good, publicKey: 5 }).ok).toBe(false);
    expect(
      parseVaultPayload({ ...good, passphraseBlob: good.passphraseBlob + "A".repeat(5000) }).ok,
    ).toBe(false);
  });

  it("rejects malformed keys and blobs", () => {
    expect(parseVaultPayload({ ...good, publicKey: "v2|x25519|AAAA" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, publicKey: "v1|rsa|AAAA" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, passphraseBlob: "v1|garbage" }).ok).toBe(false);
    expect(parseVaultPayload({ ...good, recoveryBlob: "v1|argon2id-a256gcm|x" }).ok).toBe(false);
  });

  it("rejects blobs wrapped for a different algorithm than the public key", () => {
    const flipped = good.publicKey.includes("|x25519|")
      ? good.publicKey.replace("|x25519|", "|p256|")
      : good.publicKey.replace("|p256|", "|x25519|");
    expect(parseVaultPayload({ ...good, publicKey: flipped }).ok).toBe(false);
  });

  it("enforces a minimum Argon2id cost", () => {
    expect(MIN_ARGON2.memoryKiB).toBeGreaterThanOrEqual(19456);
    const r = parseVaultPayload(weak);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cost|memory|parameters/i);
  });
});

describe("parseVaultPayload workspace", () => {
  it("requires a workspace object", () => {
    const { workspace: _w, ...rest } = good;
    void _w;
    expect(parseVaultPayload(rest).ok).toBe(false);
    for (const bad of [null, "x", 1, [], undefined]) {
      expect(parseVaultPayload({ ...good, workspace: bad }).ok).toBe(false);
    }
  });

  it("rejects missing and unexpected workspace fields", () => {
    for (const k of Object.keys(good.workspace)) {
      const { [k as keyof Good["workspace"]]: _d, ...rest } = good.workspace;
      void _d;
      expect(parseVaultPayload({ ...good, workspace: rest }).ok).toBe(false);
    }
    expect(parseVaultPayload(withWorkspace({ envKey: "AAAA" })).ok).toBe(false);
    expect(parseVaultPayload(withWorkspace({ orgId: crypto.randomUUID() })).ok).toBe(false);
  });

  it("requires a UUID env id and normalises its case", () => {
    for (const bad of ["", "not-a-uuid", "1234", good.workspace.envId + "x", 5, null]) {
      expect(parseVaultPayload(withWorkspace({ envId: bad })).ok).toBe(false);
    }
    const r = parseVaultPayload(withWorkspace({ envId: good.workspace.envId.toUpperCase() }));
    expect(r.ok && r.value.workspace.envId).toBe(good.workspace.envId);
  });

  it("requires a v1 wrapped key for the same algorithm as the public key", () => {
    const parts = good.workspace.wrappedKey.split("|");
    const other = parts[1].startsWith("x25519") ? "p256" : "x25519";
    const bad = [
      "",
      "v1|garbage",
      good.publicKey, // a public key is not a wrapped key
      good.passphraseBlob,
      ["v2", ...parts.slice(1)].join("|"),
      [parts[0], `${other}-hkdf-a256gcm`, parts[2], parts[3]].join("|"),
      [parts[0], parts[1], parts[2]].join("|"),
      [...parts, "extra"].join("|"),
      [parts[0], parts[1], "!!!", parts[3]].join("|"),
      [parts[0], parts[1], parts[2], parts[3].slice(2)].join("|"),
      good.workspace.wrappedKey + "A".repeat(5000),
      5,
    ];
    for (const wrappedKey of bad) {
      expect(parseVaultPayload(withWorkspace({ wrappedKey })).ok).toBe(false);
    }
  });

  it("accepts a P-256 wrap for a P-256 key and rejects a wrap of the wrong length", async () => {
    const v = await createVault("correct horse battery staple", { alg: "p256" });
    expect(v.keyPair.publicKey).toContain("|p256|");
    const envId = crypto.randomUUID();
    const wrappedKey = await wrapEnvironmentKey(generateEnvironmentKey(), v.keyPair.publicKey, {
      envId,
      keyVersion: 1,
    });
    expect(wrappedKey).toContain("p256-hkdf-a256gcm");
    const p256 = {
      publicKey: v.keyPair.publicKey,
      passphraseBlob: v.passphraseBlob,
      recoveryBlob: v.recoveryBlob,
      workspace: { ...good.workspace, envId, wrappedKey },
    };
    expect(parseVaultPayload(p256).ok).toBe(true);
    // An x25519-sized ephemeral key (or a wrap for the other algorithm) is not valid here.
    const [v1, , eph, ct] = wrappedKey.split("|");
    const short = [v1, "p256-hkdf-a256gcm", eph.slice(0, 43), ct].join("|");
    expect(parseVaultPayload({ ...p256, workspace: { ...p256.workspace, wrappedKey: short } }).ok).toBe(
      false,
    );
    expect(
      parseVaultPayload({ ...p256, workspace: { ...p256.workspace, wrappedKey: good.workspace.wrappedKey } })
        .ok,
    ).toBe(false);
  });

  it("trims names, and requires them non-empty, bounded and free of control characters", () => {
    const r = parseVaultPayload(withWorkspace({ orgName: "  Personal  " }));
    expect(r.ok && r.value.workspace.orgName).toBe("Personal");
    for (const field of ["orgName", "projectName", "environmentName"]) {
      for (const bad of ["", "   ", "x".repeat(65), "a\nb", "a\u0000b", 5, null]) {
        expect(parseVaultPayload(withWorkspace({ [field]: bad })).ok).toBe(false);
      }
    }
  });
});
