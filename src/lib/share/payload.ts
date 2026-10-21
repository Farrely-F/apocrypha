import { UUID } from "../vault/payload";
import { parseEnvelope } from "./crypto";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const MAX_ENVELOPE = 600_000;
export const MAX_VIEWS = 1000;
export const MAX_EXPIRY_MINUTES = 60 * 24 * 30;

export type NewShare = {
  id: string;
  envelope: string;
  passwordProtected: boolean;
  itemCount: number;
  expiresInMinutes: number | null;
  maxViews: number | null;
};

/** What the browser sends to create a link. At least one limit is required: a link never lives forever. */
export function parseNewShare(input: unknown): Parsed<NewShare> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Request body must be a JSON object.");
  const o = input as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !["id", "envelope", "itemCount", "expiresInMinutes", "maxViews"].includes(k));
  if (extra) return fail(`Unexpected field: ${extra}.`);
  if (typeof o.id !== "string" || !UUID.test(o.id)) return fail("id must be a UUID.");
  if (typeof o.envelope !== "string" || o.envelope.length === 0 || o.envelope.length > MAX_ENVELOPE) return fail("envelope is missing or too large.");
  let passwordProtected: boolean;
  try {
    passwordProtected = parseEnvelope(o.envelope).passwordProtected;
  } catch {
    return fail("envelope is not a valid share envelope.");
  }
  const int = (v: unknown, max: number, label: string): Parsed<number | null> => {
    if (v === undefined || v === null) return { ok: true, value: null };
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) return fail(`${label} must be a whole number from 1 to ${max}.`);
    return { ok: true, value: v };
  };
  const count = int(o.itemCount, 5000, "itemCount");
  if (!count.ok || count.value === null) return fail("itemCount must be a whole number from 1 to 5000.");
  const minutes = int(o.expiresInMinutes, MAX_EXPIRY_MINUTES, "expiresInMinutes");
  if (!minutes.ok) return minutes;
  const views = int(o.maxViews, MAX_VIEWS, "maxViews");
  if (!views.ok) return views;
  if (minutes.value === null && views.value === null) return fail("Set an expiry, a view limit, or both.");
  return { ok: true, value: { id: o.id.toLowerCase(), envelope: o.envelope, passwordProtected, itemCount: count.value, expiresInMinutes: minutes.value, maxViews: views.value } };
}
