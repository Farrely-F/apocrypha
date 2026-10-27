import type { ReactNode } from "react";

/**
 * The frame shared by the org and project lists. One title, one line of
 * context, one action. The table below carries the rest; no duplicated
 * breadcrumb, chapter number, or tutorial rail.
 */
export function ListView({
  title,
  summary,
  details,
  actions,
  children,
}: {
  title: string;
  summary?: ReactNode;
  /** Block content under the summary: a description, tags, links. */
  details?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[100rem] pb-10 pt-1">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-6">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[clamp(3.5rem,7vw,6.5rem)] leading-[0.8] font-semibold tracking-[-0.015em] text-bone">
            {title}
          </h1>
          {summary && <p className="mt-3 max-w-[70ch] text-sm text-bone-dim">{summary}</p>}
          {details && <div className="mt-3 grid max-w-[70ch] gap-2.5">{details}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">{actions}</div>}
      </header>

      <div className="mt-6 min-w-0">{children}</div>
    </div>
  );
}

/** One quiet line of provenance under a catalogue table. */
export function LedgerFoot({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-faint px-5 py-3 text-[0.66rem] uppercase tracking-[0.18em] text-bone-faint">
      <span>{children}</span>
      {meta && <span className="text-signal-dim">{meta}</span>}
    </div>
  );
}

/** Shared classes for the catalogue tables, so the two lists stay siblings. */
export const catalogue = {
  head: "h-9 text-[0.65rem] font-normal uppercase tracking-[0.2em] text-bone-faint",
  row: "group/row h-14 border-hairline-faint transition-colors hover:bg-pane/45",
  name: "text-bone transition-colors group-hover/row:text-signal",
  quiet: "text-bone-dim",
  chevron:
    "flex size-7 items-center justify-center border border-transparent text-bone-faint transition-colors group-hover/row:border-hairline-faint group-hover/row:text-signal",
} as const;
