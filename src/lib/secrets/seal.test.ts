import { beforeAll, describe, expect, it } from "vitest";
import { generateEnvironmentKey } from "../crypto";
import { parseCreateSecret, parseNewVersion } from "./payload";
import { openHistory, openSecret, sealNewSecret, sealVersion, type SecretRow, type VersionRow } from "./seal";

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
    expect(opened).toMatchObject({ ok: true, id: body.secretId, version: 1, name: "PRIVATE_KEY", value });
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

describe("sealVersion / openHistory", () => {
  const secretId = crypto.randomUUID();
  const asRow = (v: number, b: Awaited<ReturnType<typeof sealVersion>>, deleted = false): VersionRow => ({
    version: v, keyVersion: b.keyVersion, name: b.name, value: b.value, metadata: b.metadata, deleted,
    createdBy: "u", createdByName: "U", createdAt: v * 1000,
  });

  it("seals the next version on top of the one being edited", async () => {
    const b = await sealVersion(key1, envId, secretId, 3, 1, "NAME", "new value");
    expect(b.baseVersion).toBe(2);
    expect(b.deleted).toBe(false);
    expect(parseNewVersion(b).ok).toBe(true);
    expect(JSON.stringify(b)).not.toContain("new value");
  });

  it("is bound to its version: moving a sealed body to another version fails to open", async () => {
    const b = await sealVersion(key1, envId, secretId, 2, 1, "NAME", "v");
    const keys = new Map([[1, key1]]);
    expect((await openHistory(keys, envId, secretId, [asRow(2, b)]))[0].ok).toBe(true);
    expect((await openHistory(keys, envId, secretId, [asRow(3, b)]))[0].ok).toBe(false);
  });

  it("opens a whole history, flags tombstones, and survives one unreadable row", async () => {
    const v1 = await sealVersion(key1, envId, secretId, 1, 1, "A", "one");
    const v2 = await sealVersion(key1, envId, secretId, 2, 1, "A", "two");
    const v3 = await sealVersion(key1, envId, secretId, 3, 1, "A", "", true);
    const keys = new Map([[1, key1]]);
    const h = await openHistory(keys, envId, secretId, [asRow(1, v1), asRow(2, v2), asRow(3, v3, true)]);
    expect(h.map((x) => (x.ok ? [x.version, x.value, x.deleted] : "bad"))).toEqual([[1, "one", false], [2, "two", false], [3, "", true]]);
    const broken = await openHistory(keys, envId, secretId, [asRow(1, v1), { ...asRow(2, v2), value: "v1|a256gcm|AAAA|BBBB" }]);
    expect(broken[0].ok).toBe(true);
    expect(broken[1].ok).toBe(false);
  });

  it("a delete tombstone still seals an empty value", async () => {
    const b = await sealVersion(key1, envId, secretId, 2, 1, "GONE", "", true);
    expect(b.deleted).toBe(true);
    expect(parseNewVersion(b).ok).toBe(true);
  });
});
