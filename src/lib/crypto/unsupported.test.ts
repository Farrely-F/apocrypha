import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("a key from a browser with X25519, opened in one without", () => {
  it("is reported as unsupported, not as a bad passphrase or damaged key", async () => {
    // Make a real x25519 vault first, with the real WebCrypto.
    const real = await import("./index");
    const created = await real.createVault("correct horse battery staple", { alg: "x25519" });
    expect(created.keyPair.alg).toBe("x25519");

    // Then a runtime whose WebCrypto refuses X25519.
    vi.resetModules();
    const subtle = globalThis.crypto.subtle;
    const noX25519 = new Proxy(subtle, {
      get(target, prop) {
        if (prop === "generateKey" || prop === "importKey") {
          const real = target[prop] as (...a: unknown[]) => unknown;
          const algAt = prop === "generateKey" ? 0 : 2;
          return (...args: unknown[]) =>
            (args[algAt] as { name?: string })?.name === "X25519"
              ? Promise.reject(new DOMException("no", "NotSupportedError"))
              : real.apply(target, args);
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    vi.stubGlobal("crypto", { subtle: noX25519, getRandomValues: (a: Uint8Array) => globalThis.crypto.getRandomValues(a) });

    const fresh = await import("./index");
    const err = await fresh.unlockVault(created.passphraseBlob, "correct horse battery staple").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(fresh.CryptoError);
    expect((err as { code: string }).code).toBe("unsupported");
    expect((err as Error).message).toContain("import pkcs8: NotSupportedError");
  });
});

describe("a runtime that is picky about X25519 PKCS#8", () => {
  async function pickyRuntime(refuse: (op: string, arg0: unknown) => boolean) {
    vi.resetModules();
    const subtle = globalThis.crypto.subtle;
    const picky = new Proxy(subtle, {
      get(target, prop) {
        const v = Reflect.get(target, prop, target) as unknown;
        if (typeof v !== "function") return v;
        return (...args: unknown[]) =>
          refuse(String(prop), args[0])
            ? Promise.reject(new DOMException("no", "OperationError"))
            : (v as (...a: unknown[]) => unknown).apply(target, args);
      },
    });
    vi.stubGlobal("crypto", { subtle: picky, getRandomValues: (a: Uint8Array) => globalThis.crypto.getRandomValues(a) });
    return import("./index");
  }

  it("loads the key as a JWK, given the public key the server holds", async () => {
    const real = await import("./index");
    const created = await real.createVault("correct horse battery staple", { alg: "x25519" });
    const fresh = await pickyRuntime((op, a0) => op === "importKey" && a0 === "pkcs8");
    const pair = await fresh.unlockVault(created.passphraseBlob, "correct horse battery staple", created.keyPair.publicKey);
    expect(pair.publicKey).toBe(created.keyPair.publicKey);
    // The loaded key is the same one: it opens what the original wrapped.
    const ctx = { envId: "e", keyVersion: 1 };
    const wrapped = await real.wrapEnvironmentKey(new Uint8Array(32).fill(7), created.keyPair.publicKey, ctx);
    expect(Array.from(await fresh.unwrapEnvironmentKey(wrapped, pair, ctx))).toEqual(new Array(32).fill(7));
  });

  it("without the server's key a refused PKCS#8 import still says where", async () => {
    const real = await import("./index");
    const created = await real.createVault("correct horse battery staple", { alg: "x25519" });
    const fresh = await pickyRuntime((op, a0) => op === "importKey" && a0 === "pkcs8");
    const err = await fresh.unlockVault(created.passphraseBlob, "correct horse battery staple").catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe("unsupported");
    expect((err as Error).message).toContain("import pkcs8: OperationError");
  });

  it("falls back to the server's public key when the browser cannot derive it", async () => {
    const real = await import("./index");
    const created = await real.createVault("correct horse battery staple", { alg: "x25519" });
    // Deriving the public half needs deriveBits against the base point; refuse the first such call only.
    let derived = 0;
    const fresh = await pickyRuntime((op, a0) => op === "deriveBits" && (a0 as { name?: string })?.name === "X25519" && derived++ === 0);
    const pair = await fresh.unlockVault(created.passphraseBlob, "correct horse battery staple", created.keyPair.publicKey);
    expect(pair.publicKey).toBe(created.keyPair.publicKey);
  });
});
