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
import { isUuid, projectPath } from "@/lib/workspace/shared";

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

  return (
    <ListView
      crumbs={[{ label: "Organisations", href: "/dashboard" }, { label: org.name }]}
      title={org.name}
      summary={`you are ${org.role}, ${org.projects.length} ${org.projects.length === 1 ? "project" : "projects"}`}
      rail={
        <>
          <RailNote title="Projects">
            <p>A project is one app or service. Its environments hold the secrets for each stage.</p>
          </RailNote>
          <RailNote title="Access">
            <p>You see the environments you hold a key for. Ask an admin if one is missing.</p>
          </RailNote>
        </>
      }
    >
      <Pane title="Projects" meta={org.name} flush>
        {org.projects.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="Nothing open here">This organisation has no project yet. Create one from the project switcher in the header.</EmptyState>
          </div>
        ) : (
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Environments</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.projects.map((p) => (
                <TableRow key={p.id} className="group/row">
                  <TableCell className="pl-5">
                    <Link href={projectPath(org.id, p.id)} className="text-bone transition-colors group-hover/row:text-signal">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-bone-dim">
                    {p.environments.length === 0 ? "none you can open" : p.environments.map((e) => e.name).join(", ")}
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

export default function OrgPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Projects params={params} />
    </Suspense>
  );
}
