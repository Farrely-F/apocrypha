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
        if (prop === "generateKey")
          return (alg: { name?: string }, ...rest: unknown[]) =>
            alg?.name === "X25519" ? Promise.reject(new Error("unsupported")) : (target.generateKey as (...a: unknown[]) => unknown)(alg, ...rest);
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    vi.stubGlobal("crypto", { subtle: noX25519, getRandomValues: (a: Uint8Array) => globalThis.crypto.getRandomValues(a) });

    const fresh = await import("./index");
    const err = await fresh.unlockVault(created.passphraseBlob, "correct horse battery staple").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(fresh.CryptoError);
    expect((err as { code: string }).code).toBe("unsupported");
  });
});
