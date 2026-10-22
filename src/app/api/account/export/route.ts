import { auth } from "@/lib/auth/auth";
import { buildAccountExport } from "@/lib/account/export";
import { db } from "@/lib/db/client";
import { sameOrigin } from "@/lib/http/origin";
import { limited } from "@/lib/http/ratelimit";

/** The caller's own personal data as a JSON download. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const slow = await limited(db, `account-export:${session.user.id}`, 20, 3_600_000);
  if (slow) return slow;
  const data = await buildAccountExport(db, session.user.id);
  if (!data) return Response.json({ error: "No such account." }, { status: 404 });
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="apocrypha-account-data.json"',
      "cache-control": "private, no-store",
    },
  });
}
