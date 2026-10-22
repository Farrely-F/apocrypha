import { Suspense } from "react";
import { notFound } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Divider, PageSkeleton, Pane } from "@/components/shell";
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
    <div className="flex items-baseline gap-4">
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
      <div className="mx-auto grid max-w-[96rem] gap-x-6 gap-y-6 pt-2 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <header className="flex flex-wrap lg:col-span-full items-end justify-between gap-x-8 gap-y-3 border-b border-hairline-faint pb-5">
          <div className="min-w-0">
            <p className="truncate text-sm text-bone-faint">
              <Link href={`/o/${view.orgId}`} className="transition-colors hover:text-signal">
                {view.orgName}
              </Link>{" "}
              <span aria-hidden>/</span>{" "}
              <Link href={`/o/${view.orgId}/p/${view.projectId}`} className="transition-colors hover:text-signal">
                {view.projectName}
              </Link>
            </p>
            <h1 className="mt-1 truncate font-display text-4xl leading-none text-bone">{view.environmentName}</h1>
          </div>
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-bone-dim">
            <div className="flex items-center gap-2">
              <dt className="sr-only">Your role</dt>
              <ShieldCheck aria-hidden className="size-3.5 text-signal-dim" strokeWidth={1.5} />
              <dd>{view.role}</dd>
            </div>
            <div className="flex items-center gap-2" title="Sealed to your public key. The server holds only the wrapped key.">
              <dt className="sr-only">Key version</dt>
              <KeyRound aria-hidden className="size-3.5 text-signal-dim" strokeWidth={1.5} />
              <dd>key v{view.currentKeyVersion}, sealed to you</dd>
            </div>
          </dl>
        </header>

        <SecretsPane
          envId={view.envId}
          envName={view.environmentName}
          orgId={view.orgId}
          currentUserId={user.id}
          keyVersion={view.currentKeyVersion}
          canWrite={view.canWrite}
        />

        <aside className="grid content-start gap-6 lg:sticky lg:top-0">
          <Pane title="Environment">
            <dl className="grid gap-2">
              <Fact label="org">{view.orgName}</Fact>
              <Fact label="project">{view.projectName}</Fact>
              <Fact label="env">{view.environmentName}</Fact>
              <Fact label="role">{view.role}</Fact>
              <Fact label="access">{view.canWrite ? "read and write" : "read only"}</Fact>
            </dl>
          </Pane>

          <Pane title="Key" meta={`v${view.currentKeyVersion}`}>
            <p className="text-bone-dim">
              This environment has its own key. Yours is sealed to your public key; the server holds only the wrapped copy.
            </p>
            <Divider label="when it changes" ends className="mt-4" />
            <p className="mt-3 text-xs text-bone-faint">
              The key is replaced when someone loses read access. Older versions stay readable to the people who held them.
            </p>
          </Pane>

          <Pane title="Keys to know">
            <ul className="grid gap-2 text-sm text-bone-dim">
              <li className="flex items-center justify-between gap-4">
                <span>Command palette</span>
                <kbd className="text-xs text-bone">Ctrl K</kbd>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>Reveal, copy, edit</span>
                <span className="text-xs text-bone-faint">row actions</span>
              </li>
            </ul>
          </Pane>
        </aside>
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
