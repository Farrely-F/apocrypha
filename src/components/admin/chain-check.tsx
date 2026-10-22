"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { twoFactorErrorMessage } from "@/lib/auth/schemas";

type Report = { checkedOrgs: number; ok: number; events: number; broken: { orgId: string; brokenAt: number; reason: string }[]; limits: { orgs: number; events: number } };

/** Runs the bounded audit-chain check on demand. It is a button, not part of loading the page, so it costs nothing until asked. */
export function ChainCheck() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/system/chain-check", { method: "POST", cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (Report & { error?: string; code?: string }) | null;
    setBusy(false);
    if (!res.ok || !body) return setError(body?.code ? twoFactorErrorMessage(body.code) : (body?.error ?? "The check could not run."));
    setReport(body);
  }

  return (
    <div>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {busy ? "Checking" : "Verify audit chains"}
      </Button>
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {report && (
        <div className="mt-3 text-sm" data-testid="chain-report">
          <p className={report.broken.length ? "text-blood-bright" : "text-bone-dim"}>
            {report.broken.length === 0
              ? `All ${report.ok} of ${report.checkedOrgs} chains verified (${report.events} recent events).`
              : `${report.broken.length} of ${report.checkedOrgs} chains did not verify.`}
          </p>
          {report.broken.map((b) => (
            <p key={b.orgId} className="mt-1 font-mono text-xs text-bone-faint">
              {b.orgId} at entry {b.brokenAt}: {b.reason}
            </p>
          ))}
          <p className="mt-2 text-xs text-bone-faint">
            Looks at the {report.limits.orgs} most recently active organisations and their latest {report.limits.events.toLocaleString("en-GB")} events each.
          </p>
        </div>
      )}
    </div>
  );
}
