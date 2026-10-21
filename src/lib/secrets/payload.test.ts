import { describe, expect, it } from "vitest";
import { parseCreateSecret } from "./payload";

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
