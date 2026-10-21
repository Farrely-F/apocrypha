import { db } from "@/lib/db/client";
import { clientKey, limited } from "@/lib/http/ratelimit";
import { audit } from "@/lib/audit/store";
import { orgOfShare } from "@/lib/audit/lookup";
import { sameOrigin } from "@/lib/http/origin";
import { openShare } from "@/lib/share/store";
import { UUID } from "@/lib/vault/payload";
import { json } from "@/lib/workspace/http";

type Ctx = { params: Promise<{ shareId: string }> };

/**
 * Public: a guest with no account opens a link. This spends one view and returns the sealed
 * envelope, which is useless without the key in the link's #fragment (and the password, if any).
 * POST, not GET, so a page prefetch or an <img> cannot burn a view; the guest page sends it on a click.
 */
export async function POST(request: Request, { params }: Ctx) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request refused." }, 403);
  const { shareId } = await params;
  const tooMany =
    (await limited(db, clientKey(request) && `share-open:${clientKey(request)}`, 30, 60_000)) ?? (await limited(db, `share-open-link:${shareId.toLowerCase()}`, 60, 60_000));
  if (tooMany) return tooMany;
  const opened = UUID.test(shareId) ? await openShare(db, shareId.toLowerCase()) : null;
  if (!opened) return json({ error: "This link is not available. It may have expired, been used up, or been revoked." }, 404);
  const s = await orgOfShare(db, shareId.toLowerCase());
  if (s) await audit(db, { orgId: s.orgId, actorId: null, type: "share.opened", envId: s.envId, data: { shareId: shareId.toLowerCase(), view: opened.views } });
  return json({ ...opened, expiresAt: opened.expiresAt?.toISOString() ?? null });
}
