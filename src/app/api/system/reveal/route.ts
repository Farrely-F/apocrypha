import { db } from "@/lib/db/client";
import { readJsonLimited } from "@/lib/http/body";
import { limited } from "@/lib/http/ratelimit";
import { requireAdminRequest } from "@/lib/system/guard";
import { logAdminAccess } from "@/lib/system/access-log";
import { revealEmail } from "@/lib/system/overview";

const headers = { "cache-control": "private, no-store" };

/**
 * Show one person's full email address to the administrator. Logged first: if the log cannot be written, the
 * address is not shown. The log row holds the account's opaque id, never the address.
 */
export async function POST(request: Request) {
  const who = await requireAdminRequest(request, "users.reveal_email");
  if (who instanceof Response) return who;
  const slow = await limited(db, `system-reveal:${who.userId}`, 60, 3_600_000);
  if (slow) return slow;
  const read = await readJsonLimited(request, 500);
  const userId = read.ok ? (read.value as { userId?: unknown } | null)?.userId : undefined;
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(userId)) return Response.json({ error: "Send { userId }." }, { status: 400, headers });
  try {
    await logAdminAccess(db, { actorId: who.userId, action: "reveal_email", subjectId: userId });
  } catch {
    return Response.json({ error: "The access could not be recorded, so nothing was shown." }, { status: 500, headers });
  }
  const email = await revealEmail(db, userId);
  return email ? Response.json({ email }, { headers }) : Response.json({ error: "No such account." }, { status: 404, headers });
}
