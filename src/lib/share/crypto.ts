import { argon2id } from "hash-wasm";
import { b64u, concat, fromB64u, fromUtf8, lp, randomBytes, utf8, type Bytes } from "../crypto/encoding";
import { authFailed, malformed } from "../crypto/errors";
import { aesGcmOpen, aesGcmSeal, hkdfSha256, IV_BYTES, KEY_BYTES } from "../crypto/primitives";

/**
 * Share links. The content is sealed in the sharer's browser with a key made from a random
 * link secret (carried in the URL #fragment, which never reaches a server) and, optionally, a
 * password. With a password both are needed; with none, the link alone opens it.
 *
 * envelope = v1|link|<iv>|<ct>                        (no password)
 *          = v1|pw|m=<KiB>,t=<n>,p=1|<salt>|<iv>|<ct> (password)
 * The header (everything before the iv) and the share id are the AEAD associated data, so an
 * envelope cannot be re-labelled or moved to another link.
 */
export type SharePayload = { title: string; secrets: { name: string; value: string }[] };
export type ShareKdf = { memoryKiB: number; iterations: number };

export const SHARE_KDF: Readonly<ShareKdf> = Object.freeze({ memoryKiB: 65536, iterations: 3 });
/** Never accept a weaker password derivation than this, whatever an envelope claims. */
export const SHARE_KDF_FLOOR: Readonly<ShareKdf> = Object.freeze({ memoryKiB: 19456, iterations: 2 });
const SHARE_KDF_CEILING: Readonly<ShareKdf> = Object.freeze({ memoryKiB: 262144, iterations: 8 });

const LABEL = "apocrypha/share/v1";

async function shareKey(linkSecret: Bytes, shareId: string, password: string | null, salt: Bytes | null, kdf: ShareKdf) {
  let ikm: Bytes = linkSecret;
  if (password !== null && salt) {
    if (!password) throw authFailed();
    const raw = await argon2id({
      password: utf8(password.normalize("NFKC")),
      salt,
      iterations: kdf.iterations,
      memorySize: kdf.memoryKiB,
      parallelism: 1,
      hashLength: KEY_BYTES,
      outputType: "binary",
    });
    ikm = concat(linkSecret, raw);
  }
  return hkdfSha256(ikm, utf8(shareId), lp(LABEL), KEY_BYTES);
}

/** Seal a payload. Returns the envelope for the server and the fragment for the link. */
export async function sealShare(shareId: string, payload: SharePayload, password: string | null, kdf: ShareKdf = SHARE_KDF) {
  const linkSecret = randomBytes(KEY_BYTES);
  const salt = password !== null ? randomBytes(16) : null;
  const header = salt ? `v1|pw|m=${kdf.memoryKiB},t=${kdf.iterations},p=1|${b64u(salt)}` : "v1|link";
  const key = await shareKey(linkSecret, shareId, password, salt, kdf);
  const iv = randomBytes(IV_BYTES);
  const ct = await aesGcmSeal(key, iv, utf8(`${header}|${shareId}`), utf8(JSON.stringify(payload)));
  key.fill(0);
  return { envelope: `${header}|${b64u(iv)}|${b64u(ct)}`, fragment: b64u(linkSecret) };
}

export type ParsedEnvelope = { passwordProtected: boolean; header: string; kdf: ShareKdf | null; salt: Bytes | null; iv: Bytes; ct: Bytes };

/** Shape-check an envelope. Used by the server (which cannot open it) and by the guest's browser. */
export function parseEnvelope(envelope: string): ParsedEnvelope {
  const p = envelope.split("|");
  if (p[0] === "v1" && p[1] === "link" && p.length === 4) {
    return { passwordProtected: false, header: "v1|link", kdf: null, salt: null, iv: fromB64u(p[2]), ct: fromB64u(p[3]) };
  }
  if (p[0] === "v1" && p[1] === "pw" && p.length === 6) {
    const m = /^m=(\d{1,7}),t=(\d{1,2}),p=1$/.exec(p[2]);
    if (!m) throw malformed("bad share parameters");
    const kdf = { memoryKiB: Number(m[1]), iterations: Number(m[2]) };
    if (kdf.memoryKiB < SHARE_KDF_FLOOR.memoryKiB || kdf.iterations < SHARE_KDF_FLOOR.iterations) throw malformed("share key derivation too weak");
    if (kdf.memoryKiB > SHARE_KDF_CEILING.memoryKiB || kdf.iterations > SHARE_KDF_CEILING.iterations) throw malformed("share key derivation too costly");
    const salt = fromB64u(p[3]);
    if (salt.length < 16) throw malformed("share salt too short");
    return { passwordProtected: true, header: `v1|pw|${p[2]}|${p[3]}`, kdf, salt, iv: fromB64u(p[4]), ct: fromB64u(p[5]) };
  }
  throw malformed("not a share envelope");
}

/** Open an envelope with the link's fragment and, if it needs one, the password. Any failure is generic. */
export async function openShare(shareId: string, envelope: string, fragment: string, password: string | null): Promise<SharePayload> {
  const env = parseEnvelope(envelope);
  const linkSecret = fromB64u(fragment);
  if (linkSecret.length !== KEY_BYTES) throw authFailed();
  if (env.passwordProtected && !password) throw authFailed();
  const key = await shareKey(linkSecret, shareId, env.passwordProtected ? password : null, env.salt, env.kdf ?? SHARE_KDF);
  try {
    const pt = await aesGcmOpen(key, env.iv, utf8(`${env.header}|${shareId}`), env.ct);
    return JSON.parse(fromUtf8(pt)) as SharePayload;
  } finally {
    key.fill(0);
  }
}
