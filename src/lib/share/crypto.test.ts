import { describe, expect, it } from "vitest";
import { CryptoError } from "../crypto";
import { openShare, parseEnvelope, sealShare, SHARE_KDF_FLOOR, type SharePayload } from "./crypto";

const payload: SharePayload = { title: "staging", secrets: [{ name: "DB_URL", value: "postgres://x" }, { name: "KEY", value: "line1\nline2" }] };
const id = crypto.randomUUID();
const fast = SHARE_KDF_FLOOR; // the weakest the format accepts, to keep the test quick

describe("share links", () => {
  it("a public link opens with the fragment alone", async () => {
    const { envelope, fragment } = await sealShare(id, payload, null);
    expect(parseEnvelope(envelope).passwordProtected).toBe(false);
    expect(await openShare(id, envelope, fragment, null)).toEqual(payload);
    expect(envelope).not.toContain("postgres");
  });

  it("a password link needs both the fragment and the password", async () => {
    const { envelope, fragment } = await sealShare(id, payload, "correct horse", fast);
    expect(parseEnvelope(envelope).passwordProtected).toBe(true);
    expect(await openShare(id, envelope, fragment, "correct horse")).toEqual(payload);
    await expect(openShare(id, envelope, fragment, "wrong")).rejects.toBeInstanceOf(CryptoError);
    await expect(openShare(id, envelope, fragment, null)).rejects.toBeInstanceOf(CryptoError);
    const other = await sealShare(id, payload, "correct horse", fast);
    await expect(openShare(id, envelope, other.fragment, "correct horse")).rejects.toBeInstanceOf(CryptoError);
  });

  it("is bound to its share id and cannot be altered or downgraded", async () => {
    const { envelope, fragment } = await sealShare(id, payload, null);
    await expect(openShare(crypto.randomUUID(), envelope, fragment, null)).rejects.toBeInstanceOf(CryptoError);
    const tampered = envelope.slice(0, -4) + (envelope.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(openShare(id, tampered, fragment, null)).rejects.toBeInstanceOf(CryptoError);
    // a server claiming a cheaper derivation than the floor is refused outright
    const pw = await sealShare(id, payload, "pw", fast);
    expect(() => parseEnvelope(pw.envelope.replace("m=19456", "m=1024"))).toThrow();
    expect(() => parseEnvelope("v1|nope|x")).toThrow();
  });
});
