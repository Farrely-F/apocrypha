import { Suspense } from "react";
import { headers } from "next/headers";
import { PageSkeleton } from "@/components/shell";
import { ListView } from "@/components/workspace/list-view";
import { AccountsPane } from "@/components/settings/accounts-pane";
import { ProfilePane } from "@/components/settings/profile-pane";
import { SessionsPane } from "@/components/settings/sessions-pane";
import { TwoFactorPane } from "@/components/settings/two-factor-pane";
import { VaultPane } from "@/components/settings/vault-pane";
import { DownloadPane, ErasePane } from "@/components/settings/data-panes";
import { auth, providersEnabled } from "@/lib/auth/auth";
import { linkErrorMessage } from "@/lib/auth/errors";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Settings" };

// The account, its sign-in methods and its sessions are per-user, request-time
// data: all of it sits behind the session check.
async function Settings({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { user, session: current } = await requireSession();
  const h = await headers();
  const { error } = await searchParams;
  const linkError = linkErrorMessage(Array.isArray(error) ? error[0] : error);
  const [accounts, sessions] = await Promise.all([auth.api.listUserAccounts({ headers: h }), auth.api.listSessions({ headers: h })]);

  return (
    <ListView title="Settings" summary={`Signed in as ${user.email}. Sign-in, two-step checks and your devices live here; the vault passphrase is yours alone.`}>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <ProfilePane name={user.name} email={user.email} />
          <TwoFactorPane enabled={Boolean(user.twoFactorEnabled)} />
          <VaultPane />
          <DownloadPane />
          <ErasePane />
        </div>
        <div className="grid gap-6">
          <AccountsPane
            providers={providersEnabled}
            linkError={linkError}
            accounts={accounts.map((a) => ({ id: a.id, providerId: a.providerId, createdAt: new Date(a.createdAt).toISOString() }))}
          />
          <SessionsPane
            sessions={sessions
              .map((s) => ({
                id: s.id,
                // The token is the handle for revoking; the current session never needs one.
                token: s.token === current.token ? null : s.token,
                current: s.token === current.token,
                userAgent: s.userAgent ?? null,
                ipAddress: s.ipAddress ?? null,
                createdAt: new Date(s.createdAt).toISOString(),
                updatedAt: new Date(s.updatedAt).toISOString(),
              }))
              .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt))}
          />
        </div>
      </div>
    </ListView>
  );
}

// Reads the session, so it cannot be prerendered into the static shell.
export const instant = false;

export default function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}
