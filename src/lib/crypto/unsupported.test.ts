import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const realCrypto = globalThis.crypto;
const PASS = "correct horse battery staple";
const ctx = { envId: "e", keyVersion: 1 };

/** A WebCrypto that refuses whatever `refuse(method, firstArg)` says, as some iOS WebKit builds do. */
async function runtime(refuse: (method: string, args: unknown[]) => boolean) {
  vi.resetModules();
  const subtle = realCrypto.subtle;
  const picky = new Proxy(subtle, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof v !== "function") return v;
      return (...args: unknown[]) =>
        refuse(String(prop), args)
          ? Promise.reject(new DOMException("no", "NotSupportedError"))
          : (v as (...a: unknown[]) => unknown).apply(target, args);
    },
  });
  vi.stubGlobal("crypto", { subtle: picky, getRandomValues: (a: Uint8Array) => realCrypto.getRandomValues(a) });
  return import("./index");
}

const name = (a: unknown) => (a as { name?: string })?.name;
const refusesX25519Import = (method: string, args: unknown[]) =>
  method === "importKey" && name(args[2]) === "X25519";

describe("a browser whose WebCrypto cannot import X25519 keys", () => {
  it("still opens an X25519 vault, with the same public key and a working unwrap", async () => {
    const real = await import("./index");
    const created = await real.createVault(PASS, { alg: "x25519" });
    const granted = await real.wrapEnvironmentKey(new Uint8Array(32).fill(7), created.keyPair.publicKey, ctx);

    // generateKey works, but every import of an X25519 key is refused (the iOS 18.3 report).
    const ios = await runtime(refusesX25519Import);
    expect(await ios.supportsX25519()).toBe(false);
    const pair = await ios.unlockVault(created.passphraseBlob, PASS);
    expect(ios.isSoftKey(pair.privateKey)).toBe(true);
    expect(pair.publicKey).toBe(created.keyPair.publicKey);
    expect(Array.from(await ios.unwrapEnvironmentKey(granted, pair, ctx))).toEqual(new Array(32).fill(7));
  });

  it("can also grant to an X25519 member, and the result opens in a normal browser", async () => {
    const real = await import("./index");
    const member = await real.createVault(PASS, { alg: "x25519" });
    const ios = await runtime(refusesX25519Import);
    const wrapped = await ios.wrapEnvironmentKey(new Uint8Array(32).fill(3), member.keyPair.publicKey, ctx);
    vi.unstubAllGlobals();
    vi.resetModules();
    const back = await import("./index");
    const pair = await back.unlockVault(member.passphraseBlob, PASS);
    expect(Array.from(await back.unwrapEnvironmentKey(wrapped, pair, ctx))).toEqual(new Array(32).fill(3));
  });

  it("round-trips the key through PKCS#8 so a new vault made there opens anywhere", async () => {
    const ios = await runtime((method, args) => method === "generateKey" && name(args[0]) === "X25519");
    expect(await ios.supportsX25519()).toBe(false);
    const made = await ios.createVault(PASS, { alg: "x25519" });
    expect(ios.isSoftKey(made.keyPair.privateKey)).toBe(true);
    vi.unstubAllGlobals();
    vi.resetModules();
    const back = await import("./index");
    const pair = await back.unlockVault(made.passphraseBlob, PASS);
    expect(pair.publicKey).toBe(made.keyPair.publicKey);
    expect(back.isSoftKey(pair.privateKey)).toBe(false);
  });
});
