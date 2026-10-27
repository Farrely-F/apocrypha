import { auth } from "@/lib/auth/auth";
import { readJsonLimited } from "@/lib/http/body";
import { db } from "@/lib/db/client";
import { sameOrigin } from "@/lib/http/origin";
import { limitWrites } from "@/lib/http/ratelimit";
import { parseName } from "@/lib/vault/payload";
import { isEnvKind, parseProjectDetails, PROJECT_DETAIL_KEYS } from "./meta";
import type { EnvironmentPatch, ManageResult, ProjectPatch } from "./manage";

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Same-origin + signed-in check shared by the rename and delete routes. */
export async function guard(request: Request): Promise<{ userId: string } | Response> {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in first." }, 401);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const slow = await limitWrites(db, session.user.id);
    if (slow) return slow;
  }
  return { userId: session.user.id };
}

/** `{ name }` from a PATCH body, or an error response. */
export async function readName(request: Request): Promise<{ name: string } | Response> {
  const read = await readJsonLimited(request, 1_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const o = read.value as Record<string, unknown> | null;
  if (typeof o !== "object" || o === null || Object.keys(o).some((k) => k !== "name")) return json({ error: "Send only { name }." }, 400);
  const name = parseName(o.name, "name");
  return name.ok ? { name: name.value } : json({ error: name.error }, 400);
}

/** A PATCH body of only the keys in `allowed`, at least one. */
async function readPatch(request: Request, allowed: readonly string[]): Promise<Record<string, unknown> | Response> {
  const read = await readJsonLimited(request, 4_000);
  if (!read.ok) return json({ error: read.error }, read.status);
  const o = read.value as Record<string, unknown> | null;
  if (typeof o !== "object" || o === null || Array.isArray(o)) return json({ error: "Send a JSON object." }, 400);
  const keys = Object.keys(o);
  if (keys.length === 0 || keys.some((k) => !allowed.includes(k))) return json({ error: `Send only ${allowed.join(", ")}.` }, 400);
  return o;
}

/** The name and any plaintext details of a project, only those sent. */
export async function readProjectPatch(request: Request): Promise<ProjectPatch | Response> {
  const o = await readPatch(request, ["name", ...PROJECT_DETAIL_KEYS]);
  if (o instanceof Response) return o;
  const patch: ProjectPatch = {};
  if ("name" in o) {
    const name = parseName(o.name, "name");
    if (!name.ok) return json({ error: name.error }, 400);
    patch.name = name.value;
  }
  const details = parseProjectDetails(o);
  if (!details.ok) return json({ error: details.error }, 400);
  return { ...patch, ...details.value };
}

export async function readEnvironmentPatch(request: Request): Promise<EnvironmentPatch | Response> {
  const o = await readPatch(request, ["name", "kind"]);
  if (o instanceof Response) return o;
  const patch: EnvironmentPatch = {};
  if ("name" in o) {
    const name = parseName(o.name, "name");
    if (!name.ok) return json({ error: name.error }, 400);
    patch.name = name.value;
  }
  if ("kind" in o) {
    if (!isEnvKind(o.kind)) return json({ error: "kind must be dev, staging, prod or other." }, 400);
    patch.kind = o.kind;
  }
  return patch;
}

export function manageResponse(r: ManageResult, noun: string): Response {
  switch (r.status) {
    case "ok":
      return json({ ok: true });
    case "not-found":
      return json({ error: `No such ${noun}.` }, 404);
    case "forbidden":
      return json({ error: "Only owners and admins can do that." }, 403);
    case "name-taken":
      return json({ error: `A ${noun} with that name already exists.` }, 409);
    case "last-environment":
      return json({ error: "A project needs at least one environment. Delete the project instead." }, 409);
  }
}
