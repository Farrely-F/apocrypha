import { client } from "@/lib/db/client";

/** For container health checks: the app is up and its database answers. Reveals nothing else. */
export async function GET() {
  try {
    await client.execute("select 1");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
