"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DOCS, docPath } from "@/lib/docs";
import { cn } from "@/lib/utils";

const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/** Section list: a sticky column on wide screens, a scrolling row on narrow ones. */
export function DocsNav() {
  const here = norm(usePathname());
  return (
    <nav aria-label="Documentation" className="-mx-6 overflow-x-auto px-6 sm:-mx-10 sm:px-10 lg:sticky lg:top-20 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:grid lg:gap-0.5">
        {DOCS.map((d) => {
          const on = here === docPath(d.slug);
          return (
            <li key={d.slug} className="shrink-0">
              <Link
                href={docPath(d.slug)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "block border-b-2 px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:border-b-0 lg:border-l-2",
                  on ? "border-signal text-bone" : "border-transparent text-bone-dim hover:text-bone",
                )}
              >
                {d.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Previous and next page, from the same list. */
export function DocsPager() {
  const here = norm(usePathname());
  const i = DOCS.findIndex((d) => docPath(d.slug) === here);
  if (i < 0) return null;
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  const card = "group grid gap-1 border border-hairline-faint px-4 py-3 transition-colors hover:border-signal-dim";
  return (
    <div className="mt-16 grid max-w-[72ch] gap-3 border-t border-hairline-faint pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={docPath(prev.slug)} className={card}>
          <span className="flex items-center gap-1.5 text-xs text-bone-faint">
            <ArrowLeft aria-hidden className="size-3" /> Previous
          </span>
          <span className="text-bone transition-colors group-hover:text-signal">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={docPath(next.slug)} className={cn(card, "sm:text-right")}>
          <span className="flex items-center gap-1.5 text-xs text-bone-faint sm:justify-end">
            Next <ArrowRight aria-hidden className="size-3" />
          </span>
          <span className="text-bone transition-colors group-hover:text-signal">{next.title}</span>
        </Link>
      )}
    </div>
  );
}
