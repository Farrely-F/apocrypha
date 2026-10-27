import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/shell";
import { SecretsPane } from "@/components/secrets/secrets-pane";
import { StatusInfo } from "@/components/vault";
import { KindBadge, ProjectLinks, TagChips } from "@/components/workspace/details";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getEnvironmentForUser } from "@/lib/workspace/queries";
import { isUuid, projectPath } from "@/lib/workspace/shared";

type Params = Promise<{ orgId: string; projectId: string; envId: string }>;

// The page needs the session and a per-user access check, which cannot be
// prerendered into the static shell, so it keeps blocking on the server.
export const instant = false;

// Params and the session are request-time data, so they are read behind a
// Suspense boundary (Cache Components). Access needs the session AND org
// membership AND a grant on this environment; anything else is a 404 that does
// not say which part was missing.
async function EnvironmentView({ params }: { params: Params }) {
  const { orgId, projectId, envId } = await params;
  const { user } = await requireSession();
  if (![orgId, projectId, envId].every(isUuid)) notFound();
  const view = await getEnvironmentForUser(db, user.id, { orgId, projectId, envId });
  if (!view) notFound();

  return (
    <>
      <StatusInfo
        org={view.orgName}
        env={view.environmentName}
        keyVersion={view.currentKeyVersion}
      />
      <div className="mx-auto w-full max-w-[100rem] pb-10 pt-1">
        <header className="border-b border-hairline pb-5">
          <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <Link href={projectPath(view.orgId, view.projectId)} className="text-bone-dim underline-offset-4 transition-colors hover:text-signal hover:underline">
              {view.projectName}
            </Link>
            <KindBadge kind={view.environmentKind} />
            <TagChips tags={view.project.tags} />
          </p>
          <h1 className="truncate font-display text-[clamp(3.5rem,7vw,6.5rem)] leading-[0.8] font-semibold tracking-[-0.015em] text-bone">
            {view.environmentName}
          </h1>
          <p className="mt-2 text-sm text-bone-dim">
            {view.role} · {view.canWrite ? "read and write" : "read only"}
          </p>
          {(view.project.description || view.project.repoUrl || view.project.docsUrl) && (
            <div className="mt-3 grid max-w-[70ch] gap-2">
              {view.project.description && <p className="text-sm text-bone-dim">{view.project.description}</p>}
              <ProjectLinks repoUrl={view.project.repoUrl} docsUrl={view.project.docsUrl} />
            </div>
          )}
        </header>

        <div className="mt-6">
          <SecretsPane
            envId={view.envId}
            envName={view.environmentName}
            orgId={view.orgId}
            currentUserId={user.id}
            keyVersion={view.currentKeyVersion}
            canWrite={view.canWrite}
          />
        </div>
      </div>
    </>
  );
}

export default function EnvironmentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EnvironmentView params={params} />
    </Suspense>
  );
}
