// Plaintext project and environment details: description, tags, links, environment kind.
// Pure and shared by server and browser. Everything here is visible to the server, like the names.

export const ENV_KINDS = ["dev", "staging", "prod", "other"] as const;
export type EnvKind = (typeof ENV_KINDS)[number];
export const isEnvKind = (v: unknown): v is EnvKind => typeof v === "string" && (ENV_KINDS as readonly string[]).includes(v);

export const KIND_LABEL: Record<EnvKind, string> = { dev: "Dev", staging: "Staging", prod: "Prod", other: "Other" };

const KIND_WORDS: Record<Exclude<EnvKind, "other">, readonly string[]> = {
  prod: ["prod", "production", "prd", "live"],
  staging: ["staging", "stage", "stg", "preview", "uat", "qa", "test", "testing"],
  dev: ["dev", "development", "local", "sandbox"],
};

/** A first guess from the name, so existing and quickly named environments get a sensible badge. */
export function inferKind(name: string): EnvKind {
  const n = name.trim().toLowerCase();
  for (const kind of ["prod", "staging", "dev"] as const) if (KIND_WORDS[kind].includes(n)) return kind;
  return "other";
}

export const MAX_DESCRIPTION = 280;
export const MAX_TAGS = 8;
export const MAX_TAG = 24;
export const MAX_URL = 200;

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const TAG = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** What a person typed into the tag box, made into a tag: lowercase, words joined by hyphens. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG);
}

export function parseDescription(v: unknown, label = "description"): Parsed<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return fail(`${label} must be a string.`);
  const s = v.trim();
  if (s === "") return { ok: true, value: null };
  if (s.length > MAX_DESCRIPTION) return fail(`${label} must be at most ${MAX_DESCRIPTION} characters.`);
  if (CONTROL.test(s)) return fail(`${label} must be one line of printable text.`);
  return { ok: true, value: s };
}

export function parseTags(v: unknown, label = "tags"): Parsed<string[]> {
  if (v === null || v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v)) return fail(`${label} must be a list.`);
  if (v.length > MAX_TAGS) return fail(`Use at most ${MAX_TAGS} tags.`);
  const seen = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string" || !TAG.test(t)) return fail(`A tag is 1 to ${MAX_TAG} lowercase letters, digits or hyphens.`);
    seen.add(t);
  }
  return { ok: true, value: [...seen] };
}

/** An https link with no embedded credentials. Empty clears it. */
export function parseUrl(v: unknown, label: string): Parsed<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return fail(`${label} must be a string.`);
  const s = v.trim();
  if (s === "") return { ok: true, value: null };
  if (s.length > MAX_URL) return fail(`${label} must be at most ${MAX_URL} characters.`);
  if (CONTROL.test(s)) return fail(`${label} must be a plain link.`);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(`${label} must be a full link such as https://github.com/acme/api.`);
  }
  if (u.protocol !== "https:") return fail(`${label} must start with https://.`);
  if (u.username || u.password) return fail(`${label} must not contain a username or password.`);
  return { ok: true, value: u.toString() };
}

/** The stored JSON column back into a list. A damaged value reads as no tags. */
export function readTags(json: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(json ?? "[]");
    const t = parseTags(v);
    return t.ok ? t.value : [];
  } catch {
    return [];
  }
}

export type ProjectDetails = {
  description: string | null;
  tags: string[];
  repoUrl: string | null;
  docsUrl: string | null;
};

export const NO_DETAILS: ProjectDetails = { description: null, tags: [], repoUrl: null, docsUrl: null };

export const PROJECT_DETAIL_KEYS = ["description", "tags", "repoUrl", "docsUrl"] as const;

/**
 * The detail fields present in a request body (a patch or a create). Absent keys are left out so a
 * patch changes only what was sent; sent values are validated.
 */
export function parseProjectDetails(o: Record<string, unknown>): Parsed<Partial<ProjectDetails>> {
  const out: Partial<ProjectDetails> = {};
  if ("description" in o) {
    const r = parseDescription(o.description);
    if (!r.ok) return r;
    out.description = r.value;
  }
  if ("tags" in o) {
    const r = parseTags(o.tags);
    if (!r.ok) return r;
    out.tags = r.value;
  }
  if ("repoUrl" in o) {
    const r = parseUrl(o.repoUrl, "repoUrl");
    if (!r.ok) return r;
    out.repoUrl = r.value;
  }
  if ("docsUrl" in o) {
    const r = parseUrl(o.docsUrl, "docsUrl");
    if (!r.ok) return r;
    out.docsUrl = r.value;
  }
  return { ok: true, value: out };
}
