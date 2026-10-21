import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppShell, Divider, Pane, ShellHeader } from "@/components/shell";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getEnvironmentForUser } from "@/lib/workspace/queries";
import { isUuid } from "@/lib/workspace/shared";
import { SignOutButton } from "@/app/(app)/dashboard/sign-out-button";

type Params = Promise<{ orgId: string; projectId: string; envId: string }>;

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

  const crumb = "text-bone-faint";
  return (
    <AppShell
      header={
        <ShellHeader
          nav={
            <ol aria-label="Location" className="flex min-w-0 items-center gap-2 whitespace-nowrap">
              <li className="truncate text-bone-dim">{view.orgName}</li>
              <li aria-hidden className={crumb}>
                /
              </li>
              <li className="truncate text-bone-dim">{view.projectName}</li>
              <li aria-hidden className={crumb}>
                /
              </li>
              <li aria-current="page" className="truncate text-signal">
                {view.environmentName}
              </li>
            </ol>
          }
          actions={
            <>
              <span className="hidden text-xs text-bone-faint sm:inline">{user.email}</span>
              <SignOutButton />
            </>
          }
        />
      }
      status={null}
    >
      <div className="mx-auto grid max-w-5xl gap-8 pt-3 lg:grid-cols-[20rem_1fr]">
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
            Sealed to your public key. The server stores the wrapped key and cannot open it.
          </p>
        </Pane>

        <Pane title="Secrets" meta="0">
          <p className="text-bone">No secrets yet</p>
          <p className="mt-1 max-w-[60ch] text-bone-dim">
            Anything you add here is encrypted in this browser with this
            environment&apos;s key before it leaves it.
          </p>
          <p className="mt-6 text-bone-faint">
            <span aria-hidden className="text-signal">
              {"> "}
            </span>
            awaiting first secret
            <span aria-hidden className="mora-caret ml-1" />
          </p>
        </Pane>
      </div>
    </AppShell>
  );
}

export default function EnvironmentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <EnvironmentView params={params} />
    </Suspense>
  );
}
