const W = 600;
const H = 100;
const PAD_B = 18;

const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One count per day as plain SVG bars, drawn on the server. Each column has its number in a title. */
export function DailyBars({ days, noun }: { days: { day: string; n: number }[]; noun: string }) {
  const top = Math.max(3, ...days.map((d) => d.n));
  const h = H - PAD_B;
  const col = W / days.length;
  const total = days.reduce((a, d) => a + d.n, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${total} ${noun} in the last ${days.length} days`} className="h-auto w-full">
        <line x1={0} x2={W} y1={h} y2={h} className="stroke-hairline" strokeWidth={1} />
        {days.map((d, i) => {
          const bar = (d.n / top) * h;
          return (
            <g key={d.day}>
              <title>{`${label(d.day)}: ${d.n} ${noun}`}</title>
              <rect x={i * col + 3} y={0} width={col - 6} height={h} fill="transparent" />
              {d.n > 0 ? <rect x={i * col + 3} y={h - bar} width={col - 6} height={bar} className="fill-signal" /> : <rect x={i * col + 3} y={h - 1} width={col - 6} height={1} className="fill-hairline" />}
            </g>
          );
        })}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text key={i} x={i === 0 ? 3 : i === days.length - 1 ? W - 3 : i * col + col / 2} y={H - 4} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="fill-bone-faint font-mono" fontSize={10}>
            {label(days[i].day)}
          </text>
        ))}
      </svg>
      <figcaption className="sr-only">{days.filter((d) => d.n > 0).map((d) => `${label(d.day)}: ${d.n} ${noun}`).join(". ")}</figcaption>
    </figure>
  );
}
