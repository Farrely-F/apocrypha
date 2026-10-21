import { describe, expect, it } from "vitest";
import { MAX_BATCH, parseBatch, parseCreateSecret, parseNewVersion } from "./payload";

const cipher = (n = 20) => `v1|a256gcm|${"A".repeat(16)}|${"B".repeat(n)}`;
const good = () => ({
  secretId: crypto.randomUUID(),
  keyVersion: 1,
  name: cipher(),
  value: cipher(40),
  metadata: null,
});

describe("parseCreateSecret", () => {
  it("accepts a well-formed request, with or without metadata", () => {
    expect(parseCreateSecret(good()).ok).toBe(true);
    expect(parseCreateSecret({ ...good(), metadata: cipher() }).ok).toBe(true);
    const { metadata: _m, ...noMeta } = good();
    void _m;
    expect(parseCreateSecret(noMeta).ok).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, "x", 3, [], true]) {
      expect(parseCreateSecret(bad).ok).toBe(false);
    }
  });

  it("rejects unexpected fields, so plaintext cannot ride along", () => {
    for (const extra of ["plaintext", "secretName", "version", "environmentId"]) {
      expect(parseCreateSecret({ ...good(), [extra]: "x" }).ok).toBe(false);
    }
  });

  it("requires a uuid secretId and a positive integer keyVersion", () => {
    expect(parseCreateSecret({ ...good(), secretId: "nope" }).ok).toBe(false);
    for (const kv of [0, -1, 1.5, "1", null, 2 ** 32]) {
      expect(parseCreateSecret({ ...good(), keyVersion: kv }).ok).toBe(false);
    }
  });

  it("only accepts sealed v1 fields, never plain text", () => {
    for (const bad of ["FOO", "hunter2", "v1|a256gcm|x", "v2|a256gcm|AAAA|BBBB", "v1|other|AAAA|BBBB", "v1|a256gcm|AA AA|BBBB"]) {
      expect(parseCreateSecret({ ...good(), name: bad }).ok).toBe(false);
      expect(parseCreateSecret({ ...good(), value: bad }).ok).toBe(false);
      expect(parseCreateSecret({ ...good(), metadata: bad }).ok).toBe(false);
    }
  });

  it("caps sizes", () => {
    expect(parseCreateSecret({ ...good(), name: cipher(5000) }).ok).toBe(false);
    expect(parseCreateSecret({ ...good(), value: cipher(130_000) }).ok).toBe(false);
    // A full 64 KB plaintext seals to about 87,400 characters including framing.
    expect(parseCreateSecret({ ...good(), value: cipher(87_500) }).ok).toBe(true);
  });
});

const edit = () => ({ baseVersion: 1, keyVersion: 1, name: cipher(), value: cipher(40), metadata: null, deleted: false });

describe("parseNewVersion", () => {
  it("accepts an edit, a delete, and a body without the optional fields", () => {
    expect(parseNewVersion(edit()).ok).toBe(true);
    expect(parseNewVersion({ ...edit(), deleted: true }).ok).toBe(true);
    const { metadata: _m, deleted: _d, ...min } = edit();
    void _m; void _d;
    const r = parseNewVersion(min);
    expect(r.ok && r.value.deleted).toBe(false);
  });

  it("needs a positive integer baseVersion", () => {
    for (const v of [0, -1, 1.5, "1", null, undefined, 2 ** 32]) {
      expect(parseNewVersion({ ...edit(), baseVersion: v }).ok).toBe(false);
    }
  });

  it("refuses unknown fields, plain text and a non-boolean deleted", () => {
    expect(parseNewVersion({ ...edit(), version: 2 }).ok).toBe(false);
    expect(parseNewVersion({ ...edit(), secretId: crypto.randomUUID() }).ok).toBe(false);
    expect(parseNewVersion({ ...edit(), name: "PLAIN" }).ok).toBe(false);
    expect(parseNewVersion({ ...edit(), value: "plain" }).ok).toBe(false);
    expect(parseNewVersion({ ...edit(), deleted: "yes" }).ok).toBe(false);
    expect(parseNewVersion(null).ok).toBe(false);
  });
});

describe("parseBatch", () => {
  const one = () => ({ secretId: crypto.randomUUID(), keyVersion: 1, name: cipher(), value: cipher(), metadata: null });

  it("accepts a list of valid secrets", () => {
    const r = parseBatch({ secrets: [one(), one()] });
    expect(r.ok && r.value.length).toBe(2);
  });

  it("refuses empty, oversize, duplicate ids, bad items and extra fields", () => {
    expect(parseBatch({ secrets: [] }).ok).toBe(false);
    expect(parseBatch({ secrets: Array.from({ length: MAX_BATCH + 1 }, one) }).ok).toBe(false);
    expect(parseBatch({ secrets: Array.from({ length: MAX_BATCH }, one) }).ok).toBe(true);
    const a = one();
    expect(parseBatch({ secrets: [a, { ...one(), secretId: a.secretId }] }).ok).toBe(false);
    const bad = parseBatch({ secrets: [one(), { ...one(), name: "PLAIN" }] });
    expect(!bad.ok && bad.error).toMatch(/secrets\[1\]/);
    expect(parseBatch({ secrets: [one()], extra: 1 }).ok).toBe(false);
    expect(parseBatch([one()]).ok).toBe(false);
  });
});
