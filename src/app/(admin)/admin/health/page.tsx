import { Suspense } from "react";
import { PageSkeleton, Pane } from "@/components/shell";
import { ChainCheck } from "@/components/admin/chain-check";
import { bytes, Ledger, StaleSession, SYSTEM_PANE, TwoFactorNote } from "@/components/admin/panes";
import { formatWhen } from "@/lib/auth/device";
import { db } from "@/lib/db/client";
import { ListView } from "@/components/workspace/list-view";
import { logAdminAccess } from "@/lib/system/access-log";
import { getSystemOverview } from "@/lib/system/cached";
import { requireAdminPage } from "@/lib/system/guard";
import { checkHealth } from "@/lib/system/overview";

export const instant = false;

/** An https address for the host's log viewer, or null. Anything else in the variable is ignored. */
function logsUrl(): string | null {
  try {
    const u = new URL(process.env.SYSTEM_LOGS_URL ?? "");
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

async function Health() {
  const gate = await requireAdminPage();
  if (gate.stale) return <StaleSession minutes={gate.minutes} />;
  await logAdminAccess(db, { actorId: gate.who.userId, action: "view_health" });
  const [h, o] = await Promise.all([checkHealth(db), getSystemOverview(db)]);
  const logs = logsUrl();
  const migrationNote = h.migrations.state === "ok" ? "in step with the code" : h.migrations.state === "pending" ? "the database is behind the code: run the migrations" : h.migrations.state === "ahead" ? "the database is ahead of this build" : "could not be read";

  return (
    <ListView title="Health" summary="Checked now, when you opened this page. Nothing is held in memory or stored for it.">
      <title>{"System health | Apocrypha"}</title>
      <TwoFactorNote twoFactor={gate.who.twoFactor} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Pane title="Database" flush className={SYSTEM_PANE}>
          <Ledger
            rows={[
              { label: "Answering", value: h.database.ok ? "yes" : "NO" },
              { label: "Round trip", value: h.database.latencyMs === null ? "n/a" : `${h.database.latencyMs} ms` },
              { label: "Size", value: bytes(o.dbBytes), note: o.dbBytes === null ? "this driver does not report it" : undefined },
              { label: "Migrations", value: `${h.migrations.applied ?? "?"} of ${h.migrations.expected}`, note: migrationNote },
              { label: "Rate-limit rows", value: h.rateLimit.rows, note: `${h.rateLimit.expired} past their window, cleared as new ones are written` },
            ]}
          />
        </Pane>
        <Pane title="This deployment" flush className={SYSTEM_PANE}>
          <Ledger
            rows={[
              { label: "Environment", value: h.build.environment },
              { label: "Commit", value: h.build.commit ?? "unknown" },
              { label: "Region", value: h.build.region ?? "unknown" },
              { label: "Node", value: h.build.node },
              { label: "Checked", value: formatWhen(h.checkedAt) },
            ]}
          />
          <p className="border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">
            {logs ? (
              <>
                Server errors are written as structured log lines.{" "}
                <a href={logs} rel="noreferrer noopener" target="_blank" className="text-signal underline underline-offset-4">
                  Open the logs
                </a>
                .
              </>
            ) : (
              "Server errors are written as structured log lines to your host's log viewer. Set SYSTEM_LOGS_URL to link to it from here."
            )}
          </p>
        </Pane>
        <Pane title="Largest tables" flush className={SYSTEM_PANE}>
          <Ledger rows={o.tables.slice(0, 8).map((t) => ({ label: t.name, value: t.rows.toLocaleString("en-GB") }))} />
          <p className="border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">Row counts, as of {formatWhen(o.generatedAt)}.</p>
        </Pane>
        <Pane title="Audit chains" className={SYSTEM_PANE}>
          <p className="mb-4 text-sm text-bone-dim">Each organisation&apos;s audit log is a chain of hashes, so an edited or removed row shows. This checks the recent part of the most active ones; it reads a bounded number of rows, and only runs when you ask.</p>
          <ChainCheck />
        </Pane>
      </div>
    </ListView>
  );
}

export default function AdminHealthPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Health />
    </Suspense>
  );
}
