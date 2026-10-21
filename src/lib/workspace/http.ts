import { auth } from "@/lib/auth/auth";
import { readJsonLimited } from "@/lib/http/body";
import { sameOrigin } from "@/lib/http/origin";
import { parseName } from "@/lib/vault/payload";
import type { ManageResult } from "./manage";

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Same-origin + signed-in check shared by the rename and delete routes. */
export async function guard(request: Request): Promise<{ userId: string } | Response> {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id } : json({ error: "Sign in first." }, 401);
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
