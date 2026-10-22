import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/brand/empty-state";
import { Pane, PageSkeleton } from "@/components/shell";
import { ListView, RailNote } from "@/components/workspace/list-view";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { environmentPath, isUuid, orgPath } from "@/lib/workspace/shared";

type Params = Promise<{ orgId: string; projectId: string }>;
export const instant = false;

async function Environments({ params }: { params: Params }) {
  const { orgId, projectId } = await params;
  const { user } = await requireSession();
  if (![orgId, projectId].every(isUuid)) notFound();
  const org = (await listWorkspaceTree(db, user.id)).find((o) => o.id === orgId);
  const project = org?.projects.find((p) => p.id === projectId);
  if (!org || !project) notFound();

  return (
    <ListView
      crumbs={[
        { label: "Organisations", href: "/dashboard" },
        { label: org.name, href: orgPath(org.id) },
        { label: project.name },
      ]}
      title={project.name}
      summary={`${project.environments.length} ${project.environments.length === 1 ? "environment" : "environments"} you can open`}
      rail={
        <>
          <RailNote title="Environments">
            <p>One key per environment, wrapped to each person allowed in. Open one to read and write its secrets.</p>
          </RailNote>
          <RailNote title="Missing one?">
            <p>You only see environments you hold a key for. Access is set per member by an admin.</p>
          </RailNote>
        </>
      }
    >
      <Pane title="Environments" meta={project.name} flush>
        {project.environments.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="Nothing open here">You hold no key for any environment in this project. Ask an admin to give you access.</EmptyState>
          </div>
        ) : (
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Name</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.environments.map((e) => (
                <TableRow key={e.id} className="group/row">
                  <TableCell className="pl-5">
                    <Link
                      href={environmentPath({ orgId: org.id, projectId: project.id, envId: e.id })}
                      className="text-bone transition-colors group-hover/row:text-signal"
                    >
                      {e.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ChevronRight aria-hidden className="size-4 text-bone-faint transition-colors group-hover/row:text-signal" />
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

export default function ProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Environments params={params} />
    </Suspense>
  );
}
