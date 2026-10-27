import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/brand/empty-state";
import { Pane, PageSkeleton } from "@/components/shell";
import { ListView, catalogue } from "@/components/workspace/list-view";
import { KindBadge, ProjectLinks, TagChips } from "@/components/workspace/details";
import { EditProjectButton, EnvironmentRowActions, NewEnvironmentButton } from "@/components/workspace/workspace-dialogs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { environmentPath, isUuid, projectPath } from "@/lib/workspace/shared";
import { cn } from "@/lib/utils";

type Params = Promise<{ orgId: string; projectId: string }>;
export const instant = false;

async function Environments({ params }: { params: Params }) {
  const { orgId, projectId } = await params;
  const { user } = await requireSession();
  if (![orgId, projectId].every(isUuid)) notFound();
  const org = (await listWorkspaceTree(db, user.id)).find((o) => o.id === orgId);
  const project = org?.projects.find((p) => p.id === projectId);
  if (!org || !project) notFound();

  const canBuild = org.role === "owner" || org.role === "admin";
  const orgTags = [...new Set(org.projects.flatMap((p) => p.tags))].sort();
  const bare = !project.description && project.tags.length === 0 && !project.repoUrl && !project.docsUrl;

  return (
    <ListView
      title={project.name}
      details={
        bare ? undefined : (
          <>
            {project.description && <p className="text-sm text-bone">{project.description}</p>}
            <TagChips tags={project.tags} />
            <ProjectLinks repoUrl={project.repoUrl} docsUrl={project.docsUrl} />
          </>
        )
      }
      actions={
        canBuild ? (
          <>
            <EditProjectButton
              project={project}
              siblings={org.projects.map((p) => p.name)}
              tags={orgTags}
              label={bare ? "Add details" : "Edit details"}
            />
            {project.environments.length > 0 && (
              <NewEnvironmentButton
                projectId={project.id}
                projectName={project.name}
                taken={project.environments.map((e) => e.name)}
              />
            )}
          </>
        ) : undefined
      }
    >
      <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
        {project.environments.length === 0 ? (
          <EmptyState
            title="No environment yet"
            actions={
              canBuild ? (
                <NewEnvironmentButton
                  projectId={project.id}
                  projectName={project.name}
                  taken={[]}
                  size="sm"
                />
              ) : undefined
            }
          >
            {canBuild
              ? "Each environment gets its own key. Create dev, staging, or production."
              : "You hold no key for any environment in this project. Ask an admin for access."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(catalogue.head, "pl-5")}>Environment</TableHead>
                <TableHead className={catalogue.head}>Type</TableHead>
                <TableHead className={cn(catalogue.head, "w-24 pr-3 text-right")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.environments.map((e) => (
                <TableRow key={e.id} className={catalogue.row}>
                  <TableCell className="pl-5">
                    <Link
                      href={environmentPath({ orgId: org.id, projectId: project.id, envId: e.id })}
                      className={catalogue.name}
                    >
                      {e.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <KindBadge kind={e.kind} />
                  </TableCell>
                  <TableCell className="pr-3">
                    <div className="flex items-center justify-end gap-1">
                      <EnvironmentRowActions
                        environment={{ id: e.id, name: e.name, kind: e.kind }}
                        siblings={project.environments.map((s) => s.name)}
                        canBuild={canBuild}
                        redirect={projectPath(org.id, project.id)}
                      />
                      <Link
                        href={environmentPath({ orgId: org.id, projectId: project.id, envId: e.id })}
                        aria-label={`Open ${e.name}`}
                        className={catalogue.chevron}
                      >
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

export default function ProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Environments params={params} />
    </Suspense>
  );
}
