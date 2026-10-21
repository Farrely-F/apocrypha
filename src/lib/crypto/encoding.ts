/**
 * Byte/string encodings shared by the crypto modules. No dependencies.
 */

/** A Uint8Array backed by a plain ArrayBuffer (what WebCrypto accepts). */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8(s: string): Bytes {
  return Uint8Array.from(encoder.encode(s));
}

export function fromUtf8(b: Uint8Array): string {
  return decoder.decode(b);
}

/** Copy into a fresh, plain-ArrayBuffer-backed Uint8Array. */
export function toBytes(b: ArrayLike<number>): Bytes {
  return Uint8Array.from(b);
}

export function b64u(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const B64U_RE = /^[A-Za-z0-9_-]*$/;

export function fromB64u(s: string): Bytes {
  if (!B64U_RE.test(s) || s.length % 4 === 1) {
    throw new Error("invalid base64url");
  }
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concat(...parts: Uint8Array[]): Bytes {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function u32be(n: number): Bytes {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) {
    throw new RangeError("expected an unsigned 32-bit integer");
  }
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, false);
  return out;
}

/**
 * Unambiguous encoding of a tuple: each part is a 4-byte big-endian length
 * followed by its bytes. Strings are UTF-8, integers are 4-byte big-endian.
 * Used for HKDF `info` and AES-GCM AAD so no field can bleed into another.
 */
export function lp(...parts: (string | number | Uint8Array)[]): Bytes {
  const encoded = parts.map((p) =>
    typeof p === "string" ? utf8(p) : typeof p === "number" ? u32be(p) : p,
  );
  return concat(...encoded.flatMap((p) => [u32be(p.length), p]));
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(h: string): Bytes {
  if (h.length % 2 !== 0 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(n: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

// Crockford base32 (no I, L, O, U) for the human-facing recovery key.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function base32Encode(b: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const byte of b) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

/** Decodes Crockford base32; tolerant of case, dashes/spaces and O/I/L typos. */
export function base32Decode(s: string): Bytes {
  const clean = s
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("invalid base32");
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}
