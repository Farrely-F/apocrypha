import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Pane, PageSkeleton } from "@/components/shell";
import { EmptyState } from "@/components/brand/empty-state";
import { ListView, catalogue } from "@/components/workspace/list-view";
import { NewOrganizationButton } from "@/components/workspace/workspace-dialogs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getDashboardAnalytics, ago } from "@/lib/analytics/overview";
import { AnalyticsSection } from "@/components/analytics/analytics-panes";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { orgPath } from "@/lib/workspace/shared";
import { cn } from "@/lib/utils";

// All content lives behind the session check: anything rendered outside the
// Suspense boundary is prerendered into the static shell and would be sent to
// signed-out visitors.
async function Dashboard() {
  const { user } = await requireSession();
  const orgs = await listWorkspaceTree(db, user.id);
  const analytics = orgs.length ? await getDashboardAnalytics(db, user.id) : null;
  const stat = (id: string) => analytics?.orgs.find((o) => o.id === id);

  // A vault made before workspaces existed has no environment key, and the
  // server cannot make one: it has to be wrapped in the user's browser.
  if (orgs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl pt-1">
        <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
          <EmptyState
            title="A vault without a shelf"
            actions={<NewOrganizationButton size="sm" />}
          >
            This account has a vault but no environment. Creating an organisation makes the first
            project and environment in this browser.
          </EmptyState>
        </Pane>
      </div>
    );
  }

  return (
    <ListView
      title="Organisations"
      actions={<NewOrganizationButton />}
    >
      <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(catalogue.head, "pl-5")}>Organisation</TableHead>
              <TableHead className={cn(catalogue.head, "hidden sm:table-cell")}>Role</TableHead>
              <TableHead className={cn(catalogue.head, "text-right")}>Projects</TableHead>
              <TableHead className={cn(catalogue.head, "hidden text-right sm:table-cell")}>Environments</TableHead>
              <TableHead className={cn(catalogue.head, "text-right")}>Secrets</TableHead>
              <TableHead className={cn(catalogue.head, "hidden text-right md:table-cell")}>Last activity</TableHead>
              <TableHead className={cn(catalogue.head, "w-14 pr-5")}>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => (
              <TableRow key={o.id} className={catalogue.row}>
                <TableCell className="pl-5">
                  <Link href={orgPath(o.id)} className={catalogue.name}>
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell className={cn(catalogue.quiet, "hidden sm:table-cell")}>
                  <span className="inline-flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.16em]">
                    <span aria-hidden className={cn("size-1.5", o.role === "owner" ? "bg-signal" : "bg-bone-faint/60")} />
                    {o.role}
                  </span>
                </TableCell>
                <TableCell className="text-right font-display text-lg leading-none text-bone-dim">
                  {String(o.projects.length).padStart(2, "0")}
                </TableCell>
                <TableCell className={cn(catalogue.quiet, "hidden text-right font-display text-lg leading-none sm:table-cell")}>
                  {String(o.projects.reduce((n, p) => n + p.environments.length, 0)).padStart(2, "0")}
                </TableCell>
                <TableCell className="text-right font-display text-lg leading-none text-bone-dim">
                  {String(stat(o.id)?.secrets ?? 0).padStart(2, "0")}
                </TableCell>
                <TableCell className={cn(catalogue.quiet, "hidden text-right text-xs md:table-cell")}>
                  {stat(o.id)?.lastActivity ? ago(stat(o.id)!.lastActivity!, analytics!.generatedAt) : "none in 30 days"}
                </TableCell>
                <TableCell className="pr-5">
                  <Link href={orgPath(o.id)} aria-label={`Open ${o.name}`} className={cn(catalogue.chevron, "ml-auto")}>
                    <ChevronRight aria-hidden className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Pane>
      {analytics && <AnalyticsSection data={analytics} />}
    </ListView>
  );
}

// Reads the session, so it cannot be prerendered into the static shell.
export const instant = false;

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Dashboard />
    </Suspense>
  );
}
