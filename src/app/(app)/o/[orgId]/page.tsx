import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { EmptyState } from "@/components/brand/empty-state";
import { Pane, PageSkeleton } from "@/components/shell";
import { ListView } from "@/components/workspace/list-view";
import { ProjectList } from "@/components/workspace/project-list";
import { NewProjectButton } from "@/components/workspace/workspace-dialogs";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { listWorkspaceTree } from "@/lib/workspace/manage";
import { isUuid, orgPath } from "@/lib/workspace/shared";

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
  const orgTags = [...new Set(org.projects.flatMap((p) => p.tags))].sort();
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
        <>
          <Button nativeButton={false} variant="outline" render={<Link href={`${orgPath(org.id)}/settings`} />}>
            <Settings data-icon="inline-start" />
            Settings
          </Button>
          {canBuild && org.projects.length > 0 && <NewProjectButton orgId={org.id} taken={org.projects.map((p) => p.name)} tags={orgTags} />}
        </>
      }
    >
      <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
        {org.projects.length === 0 ? (
          <EmptyState
            title="No project yet"
            actions={canBuild ? <NewProjectButton orgId={org.id} taken={[]} tags={orgTags} size="sm" /> : undefined}
          >
            {canBuild
              ? "A project groups environments such as dev, staging and prod. Create the first one."
              : "This organisation has no project you can open. Ask an admin for access."}
          </EmptyState>
        ) : (
          <ProjectList orgId={org.id} projects={org.projects} canBuild={canBuild} />
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
