import { Suspense } from "react";
import { PageSkeleton, Pane } from "@/components/shell";
import { ActivityChart } from "@/components/analytics/activity-chart";
import { DailyBars } from "@/components/admin/daily-bars";
import { Ledger, pct, StaleSession, SYSTEM_PANE, TwoFactorNote } from "@/components/admin/panes";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/auth/device";
import { db } from "@/lib/db/client";
import { ListView } from "@/components/workspace/list-view";
import { logAdminAccess } from "@/lib/system/access-log";
import { getSystemOverview } from "@/lib/system/cached";
import { requireAdminPage } from "@/lib/system/guard";
import { refreshOverview } from "./actions";

export const instant = false;

async function Overview() {
  const gate = await requireAdminPage();
  if (gate.stale) return <StaleSession minutes={gate.minutes} />;
  await logAdminAccess(db, { actorId: gate.who.userId, action: "view_overview" });
  const o = await getSystemOverview(db);
  const { totals } = o;

  return (
    <ListView
      title="System"
      summary="Counts and dates for the whole service, from rows it already holds. Nothing here opens a secret, and every look is recorded in the access log."
      actions={
        <form action={refreshOverview}>
          <Button type="submit" size="sm" variant="outline">
            Refresh
          </Button>
        </form>
      }
    >
      <title>{"System | Apocrypha"}</title>
      <TwoFactorNote twoFactor={gate.who.twoFactor} />
      <p className="mb-6 text-xs text-bone-faint">As of {formatWhen(o.generatedAt)}. These numbers are recomputed at most every five minutes.</p>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Pane title="Service" flush className={SYSTEM_PANE}>
            <Ledger
              rows={[
                { label: "People", value: totals.users, note: `${totals.vaults} have made a vault` },
                { label: "Organisations", value: totals.organisations, note: `${totals.memberships} memberships` },
                { label: "Projects and environments", value: `${totals.projects} and ${totals.environments}` },
                { label: "Secrets", value: totals.secrets, note: "newest version is not a deletion" },
                { label: "Share links in use", value: o.inFlight.activeShares },
                { label: "Invites waiting", value: o.inFlight.pendingInvites },
                { label: "People waiting to be re-granted", value: o.inFlight.peopleWaitingForAccess },
              ]}
            />
          </Pane>
          <Pane title="Sign-ups" meta="last 30 days" className={SYSTEM_PANE}>
            <DailyBars days={o.signups.days} noun="sign-ups" />
            <p className="mt-3 text-xs text-bone-faint">{o.signups.total} new accounts in UTC days.</p>
          </Pane>
          <Pane title="Activity" meta="last 30 days, all organisations" className={SYSTEM_PANE}>
            {o.activity.total === 0 ? <p className="py-6 text-sm text-bone-faint">No audit events in the window.</p> : <ActivityChart days={o.activity.days} />}
            <p className="mt-3 text-xs text-bone-faint">Counts of audit events by kind, never their contents.</p>
          </Pane>
        </div>

        <div className="grid gap-6">
          <Pane title="Active people" flush className={SYSTEM_PANE}>
            <Ledger
              rows={[
                { label: "Last 24 hours", value: o.active.day },
                { label: "Last 7 days", value: o.active.week },
                { label: "Last 30 days", value: o.active.month },
              ]}
            />
            <p className="border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">From when a session was last refreshed, so good to about a day.</p>
          </Pane>
          <Pane title="Two-step sign-in" flush className={SYSTEM_PANE}>
            <Ledger rows={[{ label: "Turned on", value: `${o.twoFactor.enabled} of ${o.twoFactor.users}`, note: pct(o.twoFactor.enabled, o.twoFactor.users) }]} />
          </Pane>
          <Pane title="Sign-in methods" flush className={SYSTEM_PANE}>
            <Ledger rows={o.providers.length ? o.providers.map((p) => ({ label: p.provider, value: p.accounts })) : [{ label: "none yet", value: 0 }]} />
          </Pane>
        </div>
      </div>
    </ListView>
  );
}

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Overview />
    </Suspense>
  );
}
