import { DAYS, type DayBucket } from "@/lib/analytics/overview";

const W = 600;
const H = 120;
const PAD_B = 18;
const COL = W / DAYS;
const BAR = COL - 6;

const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Thirty days of activity as stacked bars: changes at the bottom, reads, then access changes. Drawn on the
 * server as plain SVG, so it needs no script. Each column carries its numbers in a title, and the same numbers
 * are in a list for screen readers.
 */
export function ActivityChart({ days }: { days: DayBucket[] }) {
  const totals = days.map((d) => d.changes + d.reads + d.access);
  const top = Math.max(4, ...totals); // a single event does not fill the chart
  const h = H - PAD_B;
  const y = (n: number) => (n / top) * h;
  const active = days.filter((_, i) => totals[i] > 0);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Activity over the last ${DAYS} days: ${totals.reduce((a, b) => a + b, 0)} events`} className="h-auto w-full">
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={h - h * f} y2={h - h * f} className="stroke-hairline-faint" strokeWidth={1} strokeDasharray={f === 1 ? undefined : "2 4"} />
        ))}
        <line x1={0} x2={W} y1={h} y2={h} className="stroke-hairline" strokeWidth={1} />
        {days.map((d, i) => {
          const x = i * COL + 3;
          const changes = y(d.changes);
          const reads = y(d.reads);
          const access = y(d.access);
          return (
            <g key={d.day}>
              <title>{`${label(d.day)}: ${d.changes} changes, ${d.reads} reads, ${d.access} access`}</title>
              <rect x={x} y={0} width={BAR} height={h} fill="transparent" />
              {d.changes > 0 && <rect x={x} y={h - changes} width={BAR} height={changes} className="fill-signal" />}
              {d.reads > 0 && <rect x={x} y={h - changes - reads} width={BAR} height={reads} className="fill-bone-faint/60" />}
              {d.access > 0 && <rect x={x} y={h - changes - reads - access} width={BAR} height={access} className="fill-signal-dim" />}
              {totals[i] === 0 && <rect x={x} y={h - 1} width={BAR} height={1} className="fill-hairline" />}
            </g>
          );
        })}
        {[0, Math.floor(DAYS / 2), DAYS - 1].map((i) => (
          <text key={i} x={i === 0 ? 3 : i === DAYS - 1 ? W - 3 : i * COL + COL / 2} y={H - 4} textAnchor={i === 0 ? "start" : i === DAYS - 1 ? "end" : "middle"} className="fill-bone-faint font-mono" fontSize={10}>
            {label(days[i].day)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-bone-faint">
        <Key className="bg-signal" text={`${days.reduce((n, d) => n + d.changes, 0)} changes`} />
        <Key className="bg-bone-faint/60" text={`${days.reduce((n, d) => n + d.reads, 0)} reads`} />
        <Key className="bg-signal-dim" text={`${days.reduce((n, d) => n + d.access, 0)} access`} />
        <span className="ml-auto hidden sm:inline">peak {Math.max(0, ...totals)} a day</span>
      </figcaption>
      <ul className="sr-only">
        {active.map((d) => (
          <li key={d.day}>
            {label(d.day)}: {d.changes} changes, {d.reads} reads, {d.access} access changes
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Key({ className, text }: { className: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`inline-block size-2 ${className}`} />
      {text}
    </span>
  );
}
