import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Divider, Pane } from "@/components/shell";
import { SecretsPane } from "@/components/secrets/secrets-pane";
import { StatusInfo } from "@/components/vault";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getEnvironmentForUser } from "@/lib/workspace/queries";
import { isUuid } from "@/lib/workspace/shared";

type Params = Promise<{ orgId: string; projectId: string; envId: string }>;

// The page needs the session and a per-user access check, which cannot be
// prerendered into the static shell, so it keeps blocking on the server.
export const instant = false;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-1.5">
      <dt className="w-16 shrink-0 text-bone-faint">{label}</dt>
      <dd className="min-w-0 truncate text-bone">{children}</dd>
    </div>
  );
}

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
      <div className="mx-auto grid max-w-7xl gap-8 pt-6 lg:grid-cols-[20rem_1fr]">
        <Pane title="Environment">
          <dl>
            <Fact label="org">{view.orgName}</Fact>
            <Fact label="project">{view.projectName}</Fact>
            <Fact label="env">{view.environmentName}</Fact>
            <Fact label="role">{view.role}</Fact>
          </dl>
          <Divider label="key" ends className="mt-4" />
          <dl className="mt-2">
            <Fact label="version">v{view.currentKeyVersion}</Fact>
          </dl>
          <p className="mt-2 text-xs text-bone-faint">
            Sealed to your public key. The server holds only the wrapped key.
          </p>
        </Pane>

        <SecretsPane
          envId={view.envId}
          envName={view.environmentName}
          orgId={view.orgId}
          currentUserId={user.id}
          keyVersion={view.currentKeyVersion}
          canWrite={view.role === "owner" || view.role === "admin"}
        />
      </div>
    </>
  );
}

export default function EnvironmentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <EnvironmentView params={params} />
    </Suspense>
  );
}
