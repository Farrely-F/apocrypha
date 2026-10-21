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
  return { ephemeralPublicKey: ephemeral.publicKey, grants, fragment: `${ephemeral.alg}.${toB64u(secret)}` };
}

/** Invitee side: unwrap with the fragment's key and re-wrap to their own public key. Needs no unlocked vault. */
export async function openInvite(
  fragment: string,
  grants: { envId: string; keyVersion: number; wrappedKey: string }[],
  myPublicKey: string,
) {
  const [alg, secret] = fragment.split(".");
  if ((alg !== "x25519" && alg !== "p256") || !secret) throw new Error("This invite link is incomplete. Ask for a new one.");
  const ephemeral: KeyPair = await importKeyPair(fromB64u(secret), alg as KeyAlg);
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
