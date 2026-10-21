import { beforeAll, describe, expect, it } from "vitest";
import { generateEnvironmentKey } from "../crypto";
import { parseCreateSecret } from "./payload";
import { openSecret, sealNewSecret, type SecretRow } from "./seal";

const envId = crypto.randomUUID();
let key1: Uint8Array;
let key2: Uint8Array;

beforeAll(() => {
  key1 = generateEnvironmentKey();
  key2 = generateEnvironmentKey();
});

describe("sealNewSecret / openSecret", () => {
  it("produces a request the server accepts, with no plaintext in it", async () => {
    const body = await sealNewSecret(key1, envId, 1, "DATABASE_URL", "postgres://u:hunter2@db/prod");
    expect(parseCreateSecret(body).ok).toBe(true);
    const wire = JSON.stringify(body);
    expect(wire).not.toContain("DATABASE_URL");
    expect(wire).not.toContain("hunter2");
    expect(wire).not.toContain("postgres");
  });

  it("opens back to the same name and value, including multi-line values", async () => {
    const value = "line one\nline two\n  indented ✓";
    const body = await sealNewSecret(key1, envId, 1, "PRIVATE_KEY", value);
    const row: SecretRow = { id: body.secretId, version: 1, keyVersion: 1, name: body.name, value: body.value, metadata: null, createdAt: 0 };
    const opened = await openSecret(new Map([[1, key1]]), envId, row);
    expect(opened).toEqual({ ok: true, id: body.secretId, version: 1, name: "PRIVATE_KEY", value });
  });

  it("reports (does not throw) when it cannot decrypt", async () => {
    const body = await sealNewSecret(key1, envId, 1, "A", "b");
    const row: SecretRow = { id: body.secretId, version: 1, keyVersion: 1, name: body.name, value: body.value, metadata: null, createdAt: 0 };
    expect((await openSecret(new Map([[1, key2]]), envId, row)).ok).toBe(false); // wrong key
    expect((await openSecret(new Map(), envId, row)).ok).toBe(false); // no key for that version
    expect((await openSecret(new Map([[1, key1]]), crypto.randomUUID(), row)).ok).toBe(false); // other env
    expect((await openSecret(new Map([[1, key1]]), envId, { ...row, id: crypto.randomUUID() })).ok).toBe(false); // swapped id
    expect((await openSecret(new Map([[1, key1]]), envId, { ...row, version: 2 })).ok).toBe(false); // replayed version
  });

  it("uses a fresh secret id each time", async () => {
    const a = await sealNewSecret(key1, envId, 1, "A", "b");
    const b = await sealNewSecret(key1, envId, 1, "A", "b");
    expect(a.secretId).not.toBe(b.secretId);
    expect(a.value).not.toBe(b.value);
  });
});
