/**
 * Properties of the design that are deliberate or known, pinned so the documentation about them
 * (docs/crypto-review.md, docs/crypto.md section 9) cannot drift from the code. When one of these starts to
 * fail because the limit was fixed, update the documents in the same change.
 */
import { describe, expect, it } from "vitest";
import { passphraseStrength } from "../vault/strength";
import { generateEnvironmentKey, generateKeyPair, unwrapEnvironmentKey, wrapEnvironmentKey } from "./index";
import { encryptSecretVersion } from "./secrets";

const ctx = { envId: "env", keyVersion: 2 };

describe("known limits of the crypto design", () => {
  it("grants are not authenticated: anyone who has your public key can hand you an environment key", async () => {
    const victim = await generateKeyPair();
    const attackerKey = generateEnvironmentKey(); // chosen by whoever can write a grant
    const forged = await wrapEnvironmentKey(attackerKey, victim.publicKey, ctx);
    const accepted = await unwrapEnvironmentKey(forged, victim, ctx);
    expect(Array.from(accepted)).toEqual(Array.from(attackerKey));
    // The context binding stops replaying a grant elsewhere, not forging a new one.
    await expect(unwrapEnvironmentKey(forged, victim, { envId: "other", keyVersion: 2 })).rejects.toThrow();
  });

  it("ciphertext length reveals plaintext length (no padding)", async () => {
    const key = generateEnvironmentKey();
    const c = { envId: "e", secretId: "s", version: 1, keyVersion: 1 };
    const short = await encryptSecretVersion(key, c, { name: "A", value: "x".repeat(10) });
    const long = await encryptSecretVersion(key, c, { name: "A", value: "x".repeat(200) });
    expect(long.value.length).toBeGreaterThan(short.value.length + 200);
    expect(short.name.length).toBe(long.name.length);
  });

  it("the passphrase estimate is a length-and-alphabet guide, not a dictionary: a word, a year and a symbol rates strong", () => {
    expect(passphraseStrength("Sunshine2024!").level).toBe("strong");
    expect(passphraseStrength("password-anything").ok).toBe(false); // but a short list of very common words is caught
  });
});
