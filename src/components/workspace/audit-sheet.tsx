"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { describeEvent } from "@/lib/audit/labels";
import type { TreeOrg } from "@/lib/workspace/manage";

type Event = { id: string; seq: number; createdAt: number; type: string; actorName: string | null; envName: string | null; targetName: string | null; data: string; hash: string };
type Chain = { ok: true; count: number; head: string } | { ok: false; brokenAt: number; reason: string } | null;

/** The organisation's audit log: who did what, and whether the chain of hashes still checks out. */
export function AuditSheet({ org, open, onOpenChange }: { org: TreeOrg; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [scope, setScope] = useState<"org" | "own">("org");
  const [chain, setChain] = useState<Chain>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isOwner = org.role === "owner";

  const load = useCallback(
    async (before?: number) => {
      try {
        const res = await fetch(`/api/organizations/${org.id}/audit${before ? `?before=${before}` : ""}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { scope: "org" | "own"; chain: Chain; events: Event[]; error?: string } | null;
        if (!res.ok || !body) throw new Error(body?.error ?? "Could not load the audit log.");
        setScope(body.scope);
        if (!before) setChain(body.chain);
        setEvents((prev) => (before ? [...prev, ...body.events] : body.events));
        setMore(body.events.length >= 100);
        setError(null);
        setLoaded(true);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [org.id],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    if (open) void load();
  }, [open, load]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Audit log of {org.name}</SheetTitle>
          <SheetDescription>
            {!loaded
              ? "Loading..."
              : scope === "org"
              ? "Everything that happened in this organisation. Entries hold ids only, never secret names or values."
              : "What happened in the environments you can open, and anything about you."}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 px-4 pb-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {chain && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {chain.ok ? (
                <Badge variant="outline" className="gap-1 text-signal">
                  <ShieldCheck className="size-3.5" /> chain verified, {chain.count} entries
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="size-3.5" /> chain broken at #{chain.brokenAt}: {chain.reason}
                </Badge>
              )}
              {chain.ok && <span className="font-mono text-xs text-bone-faint">head {chain.head.slice(0, 16)}</span>}
              {isOwner && (
                <Button nativeButton={false} size="sm" variant="outline" className="ml-auto" render={<a href={`/api/organizations/${org.id}/audit/export`} download />}>
                  <Download data-icon="inline-start" />
                  Export JSON
                </Button>
              )}
            </div>
          )}

          <ol className="relative flex flex-col before:absolute before:top-3 before:bottom-3 before:left-[0.4375rem] before:w-px before:bg-hairline-faint">
            {events.map((e) => (
              <li key={e.id} className="relative flex items-start gap-4 py-2.5">
                <span aria-hidden className="relative z-10 mt-1.5 size-[0.9375rem] shrink-0 border border-hairline bg-background" />
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-bone break-words">{describeEvent(e)}</p>
                  <p className="text-xs text-bone-faint">
                    {e.actorName ?? "guest"}, {new Date(e.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
            {loaded && events.length === 0 && !error && (
              <li className="py-2 pl-8 text-bone-faint">Nothing recorded yet.</li>
            )}
          </ol>
          {more && (
            <div>
              <Button size="sm" variant="outline" onClick={() => void load(events.at(-1)?.seq)}>
                Older entries
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
