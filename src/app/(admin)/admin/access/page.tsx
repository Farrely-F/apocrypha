import { Suspense } from "react";
import { PageSkeleton, Pane } from "@/components/shell";
import { StaleSession, SYSTEM_PANE, TwoFactorNote } from "@/components/admin/panes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListView, catalogue } from "@/components/workspace/list-view";
import { formatWhen } from "@/lib/auth/device";
import { db } from "@/lib/db/client";
import { listAccessLog, logAdminAccess, retentionDays } from "@/lib/system/access-log";
import { requireAdminPage } from "@/lib/system/guard";
import { cn } from "@/lib/utils";

export const instant = false;

const WHAT: Record<string, string> = {
  view_overview: "Opened the overview",
  view_users: "Opened the people list",
  reveal_email: "Showed a full email address",
  lookup_email: "Looked someone up by address",
  view_health: "Opened health",
  run_chain_check: "Ran the audit chain check",
  view_access_log: "Opened this log",
};

async function Access() {
  const gate = await requireAdminPage();
  if (gate.stale) return <StaleSession minutes={gate.minutes} />;
  await logAdminAccess(db, { actorId: gate.who.userId, action: "view_access_log" });
  const rows = await listAccessLog(db, 100);
  const days = retentionDays();

  return (
    <ListView title="Access log" summary={`Everything the administrator has looked at, newest first. Entries are removed after ${days} days. They hold opaque ids, never an email address.`}>
      <title>{"Access log | Apocrypha"}</title>
      <TwoFactorNote twoFactor={gate.who.twoFactor} />
      <Pane flush className={SYSTEM_PANE}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(catalogue.head, "pl-5")}>When (UTC)</TableHead>
              <TableHead className={catalogue.head}>What</TableHead>
              <TableHead className={cn(catalogue.head, "hidden sm:table-cell")}>By</TableHead>
              <TableHead className={cn(catalogue.head, "hidden pr-5 md:table-cell")}>Account involved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={catalogue.row}>
                <TableCell className="pl-5 text-xs text-bone-dim">{formatWhen(r.at)}</TableCell>
                <TableCell className="text-bone-dim">{WHAT[r.action] ?? r.action}</TableCell>
                <TableCell className={cn(catalogue.quiet, "hidden font-mono text-xs sm:table-cell")}>{r.actorId === gate.who.userId ? "you" : `${r.actorId.slice(0, 8)}…`}</TableCell>
                <TableCell className={cn(catalogue.quiet, "hidden pr-5 font-mono text-xs md:table-cell")}>{r.subjectId ? `${r.subjectId.slice(0, 8)}…` : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Pane>
    </ListView>
  );
}

export default function AdminAccessPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Access />
    </Suspense>
  );
}
