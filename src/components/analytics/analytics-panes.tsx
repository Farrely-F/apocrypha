import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Pane } from "@/components/shell";
import { describeEvent } from "@/lib/audit/labels";
import { AGE_BUCKETS, ago, type Analytics } from "@/lib/analytics/overview";
import { cn } from "@/lib/utils";
import { ActivityChart } from "./activity-chart";

const BAR_TONE = ["bg-signal", "bg-signal-dim", "bg-bone-faint/70", "bg-bone"] as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The part of the dashboard under the organisations: what has been happening, what is getting old, and what
 * needs a person. Everything here is a count or a date the server already holds; the secrets themselves are
 * ciphertext and are never opened for this.
 */
export function AnalyticsSection({ data }: { data: Analytics }) {
  const { activity, freshness, insights, recent, account } = data;
  const several = data.orgs.length > 1;
  const widest = Math.max(1, ...freshness.counts);

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
      <div className="grid gap-6 lg:col-span-2">
        <Pane title="Activity" meta="last 30 days" className="bg-abyss/65 backdrop-blur-md">
          {activity.total === 0 ? (
            <p className="py-6 text-sm text-bone-faint">Nothing has happened in the last 30 days that you can see.</p>
          ) : (
            <ActivityChart days={activity.days} />
          )}
          <p className="mt-3 text-xs text-bone-faint">
            {activity.partial
              ? "Counted from the audit log entries you can see: owners and admins see their whole organisation."
              : "Counted from your organisations' audit logs, in UTC days."}
          </p>
        </Pane>

        <Pane title="Recent" flush className="bg-abyss/65 backdrop-blur-md">
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-bone-faint">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-hairline-faint">
              {recent.map((e) => (
                <li key={e.id} className="flex items-baseline gap-4 px-5 py-3 text-sm">
                  <span className="w-28 shrink-0 text-xs text-bone-faint">{ago(e.createdAt, data.generatedAt)}</span>
                  <span className="min-w-0 text-bone-dim">
                    <span className="text-bone">{e.actorName ?? "A guest"}</span> {describeEvent(e)}
                    {several && <span className="text-bone-faint"> · {e.orgName}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Pane>
      </div>

      <div className="grid gap-6">
        <Pane title="Needs attention" flush className="bg-abyss/65 backdrop-blur-md">
          {insights.length === 0 ? (
            <p className="px-5 py-6 text-sm text-bone-faint">Nothing needs attention.</p>
          ) : (
            <ul className="divide-y divide-hairline-faint">
              {insights.map((i) => (
                <li key={i.id}>
                  <Link href={i.href} className="group/row flex items-start gap-3 px-5 py-3 text-sm transition-colors hover:bg-pane/45">
                    <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0", i.tone === "attention" ? "bg-signal" : "bg-bone-faint/60")} />
                    <span className="min-w-0 flex-1 text-bone-dim group-hover/row:text-bone">{i.text}</span>
                    <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-bone-faint group-hover/row:text-signal" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Pane>

        <Pane title="Secret age" meta={plural(freshness.total, "secret", "secrets")} className="bg-abyss/65 backdrop-blur-md">
          {freshness.total === 0 ? (
            <p className="text-sm text-bone-faint">No secrets you can open yet.</p>
          ) : (
            <>
              <ul className="grid gap-3">
                {AGE_BUCKETS.map((b, i) => (
                  <li key={b.key} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-xs">
                    <span className="text-bone-faint">{b.label}</span>
                    <span aria-hidden className="h-2 bg-pane-raised/60">
                      <span className={cn("block h-full", BAR_TONE[i])} style={{ width: `${(freshness.counts[i] / widest) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-bone-dim">{freshness.counts[i]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-bone-faint">
                Since each secret last changed.{freshness.oldestDays !== null && freshness.oldestDays >= 30 ? ` The oldest is ${freshness.oldestDays} days.` : ""}
              </p>
            </>
          )}
        </Pane>

        <Pane title="Your account" flush className="bg-abyss/65 backdrop-blur-md">
          <ul className="divide-y divide-hairline-faint text-sm">
            <Row href="/settings" label="Two-step sign-in" value={account.twoFactor ? "on" : "off"} warn={!account.twoFactor} />
            <Row href="/settings" label="Signed in on" value={plural(account.sessions, "device", "devices")} />
            <Row href="/settings" label="Sign-in methods" value={String(account.providers)} />
          </ul>
        </Pane>
      </div>
    </div>
  );
}

function Row({ href, label, value, warn }: { href: string; label: string; value: string; warn?: boolean }) {
  return (
    <li>
      <Link href={href} className="group/row flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-pane/45">
        <span className="text-bone-dim group-hover/row:text-bone">{label}</span>
        <span className={cn("text-xs uppercase tracking-[0.16em]", warn ? "text-bone" : "text-signal-dim")}>{value}</span>
      </Link>
    </li>
  );
}
