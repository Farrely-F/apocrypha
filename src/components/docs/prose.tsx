import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page frame: title, one-line lead, then the sections. */
export function Article({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <article className="min-w-0">
      <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] font-semibold text-bone">{title}</h1>
      <p className="mt-4 max-w-[62ch] text-base text-bone-dim">{lead}</p>
      <div className="mt-10 grid max-w-[72ch] gap-5">{children}</div>
    </article>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function H2({ children }: { children: string }) {
  const id = slug(children);
  return (
    <h2 id={id} className="group mt-8 scroll-mt-20 border-t border-hairline-faint pt-8 font-display text-3xl text-bone">
      <a href={`#${id}`} className="transition-colors hover:text-signal">
        {children}
      </a>
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-sm font-semibold tracking-wide text-bone">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-bone-dim">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="grid list-disc gap-2 pl-5 leading-relaxed text-bone-dim marker:text-signal-dim">{children}</ul>;
}

/** Numbered steps with the brand's square counters. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="grid gap-4 [counter-reset:step]">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="relative grid gap-1 border border-hairline-faint bg-pane/40 py-4 pr-5 pl-14 [counter-increment:step] before:absolute before:top-4 before:left-4 before:flex before:size-6 before:items-center before:justify-center before:border before:border-signal-dim before:text-xs before:text-signal before:content-[counter(step)]">
      <span className="text-bone">{title}</span>
      <span className="leading-relaxed text-bone-dim">{children}</span>
    </li>
  );
}

/** Inline code or a UI label. */
export function C({ children }: { children: ReactNode }) {
  return <code className="border border-hairline-faint bg-pane px-1.5 py-0.5 text-[0.85em] text-bone">{children}</code>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border border-hairline bg-pane px-1.5 py-0.5 text-[0.8em] text-bone">{children}</kbd>;
}

const TONE = {
  note: "border-hairline text-bone-dim",
  warn: "border-blood/60 text-bone-dim",
  tip: "border-signal-dim/70 text-bone-dim",
} as const;

export function Callout({ tone = "note", title, children }: { tone?: keyof typeof TONE; title: string; children: ReactNode }) {
  const label = { note: "text-bone", warn: "text-blood-bright", tip: "text-signal" }[tone];
  return (
    <aside className={cn("grid gap-1 border-l-2 bg-pane/40 px-4 py-3 leading-relaxed", TONE[tone])}>
      <span className={cn("text-xs tracking-[0.18em] uppercase", label)}>{title}</span>
      <span>{children}</span>
    </aside>
  );
}

/** A two-column list of terms and what they mean. */
export function Terms({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="grid border border-hairline-faint">
      {items.map(([term, def], i) => (
        <div key={term} className={cn("grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6", i > 0 && "border-t border-hairline-faint")}>
          <dt className="text-bone">{term}</dt>
          <dd className="leading-relaxed text-bone-dim">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
