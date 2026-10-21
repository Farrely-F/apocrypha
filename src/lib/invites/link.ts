import {
  exportPrivateKey,
  generateKeyPair,
  importKeyPair,
  unwrapEnvironmentKey,
  wrapEnvironmentKey,
  type KeyAlg,
  type KeyPair,
} from "../crypto";

const toB64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/**
 * Admin side: wrap the chosen environment keys to a throwaway key pair. The
 * throwaway private key goes in the link's #fragment, which browsers never
 * send to a server; the server only ever stores the wrapped keys.
 */
export async function sealInvite(keys: { envId: string; keyVersion: number; key: Uint8Array }[]) {
  const ephemeral = await generateKeyPair({ extractable: true });
  const grants = await Promise.all(
    keys.map(async (k) => ({
      envId: k.envId,
      wrappedKey: await wrapEnvironmentKey(k.key, ephemeral.publicKey, { envId: k.envId, keyVersion: k.keyVersion }),
    })),
  );
  const secret = await exportPrivateKey(ephemeral.privateKey);
  // A second secret, only its hash goes to the server: the invite id alone cannot redeem.
  const token = toB64u(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const redeemHash = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return { ephemeralPublicKey: ephemeral.publicKey, redeemHash, grants, fragment: `${ephemeral.alg}.${toB64u(secret)}.${token}` };
}

/** Split a link fragment into the key material and the redeem secret. */
export function readFragment(fragment: string) {
  const [alg, secret, token] = fragment.split(".");
  if ((alg !== "x25519" && alg !== "p256") || !secret || !token) throw new Error("This invite link is incomplete. Ask for a new one.");
  return { alg: alg as KeyAlg, secret, token };
}

/** Invitee side: unwrap with the fragment's key and re-wrap to their own public key. Needs no unlocked vault. */
export async function openInvite(
  fragment: string,
  grants: { envId: string; keyVersion: number; wrappedKey: string }[],
  myPublicKey: string,
) {
  const { alg, secret } = readFragment(fragment);
  const ephemeral: KeyPair = await importKeyPair(fromB64u(secret), alg);
  const out: { envId: string; wrappedKey: string }[] = [];
  for (const g of grants) {
    const ctx = { envId: g.envId, keyVersion: g.keyVersion };
    const key = await unwrapEnvironmentKey(g.wrappedKey, ephemeral, ctx);
    try {
      out.push({ envId: g.envId, wrappedKey: await wrapEnvironmentKey(key, myPublicKey, ctx) });
    } finally {
      key.fill(0);
    }
  }
  return out;
}
