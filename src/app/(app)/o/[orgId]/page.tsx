import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/brand/empty-state";
import { Pane, PageSkeleton } from "@/components/shell";
import { ListView, catalogue } from "@/components/workspace/list-view";
import { NewProjectButton, ProjectRowActions } from "@/components/workspace/workspace-dialogs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { isUuid, projectPath } from "@/lib/workspace/shared";
import { cn } from "@/lib/utils";

type Params = Promise<{ orgId: string }>;
export const instant = false;

// Membership is checked by reading the user's own tree: an org that is not in
// it is a 404 that does not say whether it exists.
async function Projects({ params }: { params: Params }) {
  const { orgId } = await params;
  const { user } = await requireSession();
  if (!isUuid(orgId)) notFound();
  const org = (await listWorkspaceTree(db, user.id)).find((o) => o.id === orgId);
  if (!org) notFound();

  const environments = org.projects.reduce((n, p) => n + p.environments.length, 0);
  const canBuild = org.role === "owner" || org.role === "admin";

  return (
    <ListView
      title={org.name}
      summary={
        <>
          {org.role} · {org.projects.length} {org.projects.length === 1 ? "project" : "projects"} ·{" "}
          {environments} {environments === 1 ? "environment" : "environments"}
        </>
      }
      actions={
        canBuild && org.projects.length > 0 ? (
          <NewProjectButton orgId={org.id} taken={org.projects.map((p) => p.name)} />
        ) : undefined
      }
    >
      <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
        {org.projects.length === 0 ? (
          <EmptyState
            title="No project yet"
            actions={canBuild ? <NewProjectButton orgId={org.id} taken={[]} size="sm" /> : undefined}
          >
            {canBuild
              ? "A project groups environments such as dev, staging and prod. Create the first one."
              : "This organisation has no project you can open. Ask an admin for access."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(catalogue.head, "pl-5")}>Project</TableHead>
                <TableHead className={catalogue.head}>Environments</TableHead>
                <TableHead className={cn(catalogue.head, "w-24 pr-3 text-right")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.projects.map((p) => (
                <TableRow key={p.id} className={catalogue.row}>
                  <TableCell className="pl-5">
                    <Link href={projectPath(org.id, p.id)} className={catalogue.name}>
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-0 truncate">
                    {p.environments.length === 0 ? (
                      <span className="text-bone-faint">none you can open</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {p.environments.map((e) => (
                          <span
                            key={e.id}
                            className="border border-hairline-faint px-1.5 py-0.5 text-[0.64rem] uppercase tracking-[0.14em] text-bone-dim"
                          >
                            {e.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="pr-3">
                    <div className="flex items-center justify-end gap-1">
                      <ProjectRowActions
                        project={{ id: p.id, name: p.name }}
                        siblings={org.projects.map((s) => s.name)}
                        canBuild={canBuild}
                        redirect={`/o/${org.id}`}
                      />
                      <Link href={projectPath(org.id, p.id)} aria-label={`Open ${p.name}`} className={catalogue.chevron}>
                        <ChevronRight aria-hidden className="size-4" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Pane>
    </ListView>
  );
}

export default function OrgPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Projects params={params} />
    </Suspense>
  );
}
