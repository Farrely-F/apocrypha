import { checkWrappedKey, UUID, type Alg } from "../vault/payload";
import type { WrappedGrant } from "./store";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const B64U = /^[A-Za-z0-9_-]+$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

function grants(input: unknown, alg: Alg): Parsed<WrappedGrant[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) return fail("grants must be a list of 1 to 50 environments.");
  const out: WrappedGrant[] = [];
  for (const g of input) {
    if (typeof g !== "object" || g === null) return fail("Each grant must be an object.");
    const o = g as Record<string, unknown>;
    if (Object.keys(o).some((k) => k !== "envId" && k !== "wrappedKey")) return fail("Unexpected grant field.");
    if (typeof o.envId !== "string" || !UUID.test(o.envId)) return fail("grant.envId must be a UUID.");
    const bad = checkWrappedKey(o.wrappedKey, alg);
    if (bad) return fail(`grant.${bad}`);
    out.push({ envId: o.envId.toLowerCase(), wrappedKey: o.wrappedKey as string });
  }
  return { ok: true, value: out };
}

export type NewInviteBody = { email: string | null; ephemeralPublicKey: string; grants: WrappedGrant[] };

export function parseNewInvite(input: unknown): Parsed<NewInviteBody> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Request body must be a JSON object.");
  const o = input as Record<string, unknown>;
  if (Object.keys(o).some((k) => !["email", "ephemeralPublicKey", "grants"].includes(k))) return fail("Unexpected field.");
  const key = o.ephemeralPublicKey;
  const parts = typeof key === "string" ? key.split("|") : [];
  if (parts.length !== 3 || parts[0] !== "v1" || (parts[1] !== "x25519" && parts[1] !== "p256") || !B64U.test(parts[2]) || parts[2].length > 120) {
    return fail("ephemeralPublicKey must be a v1 public key.");
  }
  let email: string | null = null;
  if (o.email !== undefined && o.email !== null && o.email !== "") {
    if (typeof o.email !== "string" || !EMAIL.test(o.email.trim())) return fail("email must be an email address.");
    email = o.email.trim().toLowerCase();
  }
  const g = grants(o.grants, parts[1]);
  return g.ok ? { ok: true, value: { email, ephemeralPublicKey: key as string, grants: g.value } } : g;
}

export function parseRedeem(input: unknown, alg: Alg): Parsed<WrappedGrant[]> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Request body must be a JSON object.");
  const o = input as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "grants")) return fail("Unexpected field.");
  return grants(o.grants, alg);
}
