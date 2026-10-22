import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Pane } from "@/components/shell";

export type Crumb = { label: string; href?: string };

/**
 * The frame shared by the org, project and environment lists: breadcrumb and a
 * display title across the top, the list in a pane on the left, and a rail of
 * notes on the right so the width is used for something.
 */
export function ListView({
  crumbs,
  title,
  summary,
  rail,
  children,
}: {
  crumbs: Crumb[];
  title: string;
  summary?: ReactNode;
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-[96rem] gap-x-6 gap-y-6 pt-2 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-hairline-faint pb-5 lg:col-span-full">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-bone-faint">
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight aria-hidden className="size-3" />}
                {c.href ? (
                  <Link href={c.href} className="transition-colors hover:text-signal">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="mt-1 truncate font-display text-4xl leading-none text-bone">{title}</h1>
        </div>
        {summary && <p className="text-xs text-bone-dim">{summary}</p>}
      </header>
      {children}
      <aside className="grid content-start gap-6 lg:sticky lg:top-0">{rail}</aside>
    </div>
  );
}

/** One notched pane of notes for the rail. */
export function RailNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Pane title={title}>
      <div className="grid gap-2 text-sm text-bone-dim">{children}</div>
    </Pane>
  );
}
