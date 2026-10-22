import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton, Pane } from "@/components/shell";
import { RevealEmail } from "@/components/admin/reveal-email";
import { StaleSession, SYSTEM_PANE, TwoFactorNote } from "@/components/admin/panes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListView, catalogue } from "@/components/workspace/list-view";
import { ago } from "@/lib/analytics/overview";
import { db } from "@/lib/db/client";
import { logAdminAccess } from "@/lib/system/access-log";
import { requireAdminPage } from "@/lib/system/guard";
import { listUsers, lookupUser, nowMs, USERS_PAGE, type UserRow } from "@/lib/system/overview";
import { cn } from "@/lib/utils";

export const instant = false;

type Search = Promise<{ page?: string | string[]; q?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function People({ searchParams }: { searchParams: Search }) {
  const gate = await requireAdminPage();
  if (gate.stale) return <StaleSession minutes={gate.minutes} />;
  const sp = await searchParams;
  const q = first(sp.q)?.trim().slice(0, 254) ?? "";
  const asOf = nowMs();

  // A lookup is for someone whose address you already have; it finds exactly that person or nobody.
  let rows: UserRow[];
  let total: number;
  let page = 1;
  let pages = 1;
  if (q) {
    const one = await lookupUser(db, q);
    await logAdminAccess(db, { actorId: gate.who.userId, action: "lookup_email", subjectId: one?.id ?? null });
    rows = one ? [one] : [];
    total = rows.length;
  } else {
    const list = await listUsers(db, Number(first(sp.page)) || 1);
    await logAdminAccess(db, { actorId: gate.who.userId, action: "view_users" });
    ({ rows, total, page, pages } = list);
  }

  return (
    <ListView title="People" summary={`${total} ${q ? (total === 1 ? "match" : "matches") : "accounts"}. Addresses are masked; showing one is recorded.`}>
      <title>{"People | Apocrypha"}</title>
      <TwoFactorNote twoFactor={gate.who.twoFactor} />
      <form method="get" role="search" className="mb-6 flex max-w-xl gap-2">
        <Input name="q" type="email" defaultValue={q} placeholder="Look up a full email address" aria-label="Look up a full email address" autoComplete="off" spellCheck={false} />
        <Button type="submit" variant="outline">
          Look up
        </Button>
        {q && (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/admin/users" />}>
            Clear
          </Button>
        )}
      </form>

      <Pane flush className={SYSTEM_PANE}>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-bone-faint">{q ? "No account has exactly that address. Only a full address finds anyone." : "No accounts yet."}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(catalogue.head, "pl-5")}>Account</TableHead>
                <TableHead className={cn(catalogue.head, "hidden md:table-cell")}>Joined</TableHead>
                <TableHead className={catalogue.head}>Last active</TableHead>
                <TableHead className={cn(catalogue.head, "hidden sm:table-cell")}>2FA</TableHead>
                <TableHead className={cn(catalogue.head, "hidden lg:table-cell")}>Sign-in</TableHead>
                <TableHead className={cn(catalogue.head, "text-right")}>Orgs</TableHead>
                <TableHead className={cn(catalogue.head, "hidden text-right sm:table-cell")}>Secrets</TableHead>
                <TableHead className={cn(catalogue.head, "hidden pr-5 text-right md:table-cell")}>Vault</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={catalogue.row}>
                  <TableCell className="pl-5">
                    <RevealEmail userId={r.id} masked={r.maskedEmail} />
                  </TableCell>
                  <TableCell className={cn(catalogue.quiet, "hidden text-xs md:table-cell")}>{new Date(r.joinedAt).toISOString().slice(0, 10)}</TableCell>
                  <TableCell className={cn(catalogue.quiet, "text-xs")}>{r.lastActiveAt ? ago(r.lastActiveAt, asOf) : "never"}</TableCell>
                  <TableCell className={cn(catalogue.quiet, "hidden text-xs uppercase tracking-[0.14em] sm:table-cell")}>{r.twoFactor ? "on" : "off"}</TableCell>
                  <TableCell className={cn(catalogue.quiet, "hidden text-xs lg:table-cell")}>{r.providers.join(", ") || "none"}</TableCell>
                  <TableCell className="text-right tabular-nums text-bone-dim">{r.organisations}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-bone-dim sm:table-cell">{r.secretsCreated}</TableCell>
                  <TableCell className={cn(catalogue.quiet, "hidden pr-5 text-right text-xs md:table-cell")}>{r.hasVault ? "yes" : "no"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!q && pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">
            <span>
              Page {page} of {pages} · {USERS_PAGE} to a page, newest first
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Button size="xs" variant="outline" nativeButton={false} render={<Link href={`/admin/users?page=${page - 1}`} />}>
                  Newer
                </Button>
              )}
              {page < pages && (
                <Button size="xs" variant="outline" nativeButton={false} render={<Link href={`/admin/users?page=${page + 1}`} />}>
                  Older
                </Button>
              )}
            </span>
          </nav>
        )}
      </Pane>
    </ListView>
  );
}

export default function AdminPeoplePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <People searchParams={searchParams} />
    </Suspense>
  );
}
