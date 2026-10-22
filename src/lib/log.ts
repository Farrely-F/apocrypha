/**
 * Structured logging: one JSON object per line on stdout, which Vercel and most hosts capture and index.
 *
 * What may appear is decided here, not at each call site. Only the fields in ALLOWED are written; everything
 * else is dropped. Strings that survive are scrubbed of anything shaped like an email address, token, cookie,
 * ciphertext blob, long encoded string or id. The one personal identifier allowed is the administrator's opaque
 * user id, and only on `admin.*` events, because that is the accountability record. See docs/PRIVACY.md.
 */
type Level = "info" | "warn" | "error";

const ALLOWED = new Set(["requestId", "route", "method", "status", "durationMs", "errorName", "errorCode", "digest", "bucket", "rule", "action", "count", "actorId"]);

const PATTERNS: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
  [/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "<token>"],
  [/\b(?:__Secure-)?[\w.-]*(?:session|token|two_factor|trust_device)[\w.-]*=[^;\s]+/gi, "<cookie>"],
  [/\bv1\|[A-Za-z0-9_|.=-]{8,}/g, "<sealed>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  [/\b[A-Za-z0-9_-]{32,}\b/g, "<encoded>"],
  [/\b(?:password|passphrase|secret|code)=\S+/gi, "<redacted>"],
];

export function redactText(input: string): string {
  let out = input;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out.length > 300 ? `${out.slice(0, 300)}...` : out;
}

type Fields = Record<string, unknown>;

/** The allowed fields of an event, with strings scrubbed. Exported for tests. */
export function cleanFields(event: string, fields: Fields): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.has(k) || v === undefined || v === null) continue;
    if (k === "actorId" && !event.startsWith("admin.")) continue; // an id only where accountability needs one
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = k === "actorId" ? v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) : redactText(v);
  }
  return out;
}

export function logLine(level: Level, event: string, fields: Fields = {}, now = new Date()): string {
  return JSON.stringify({ ts: now.toISOString(), level, event: redactText(event).slice(0, 80), ...cleanFields(event, fields) });
}

function write(level: Level, event: string, fields?: Fields) {
  const line = logLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

/** A class and a code, never the message: error text is where addresses and ids tend to leak in. */
export function errorFields(e: unknown): { errorName: string; errorCode?: string } {
  const name = e instanceof Error ? e.name : typeof e;
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
  return { errorName: name.slice(0, 60), ...(code ? { errorCode: code.slice(0, 60) } : {}) };
}
