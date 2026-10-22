import type { ReactNode } from "react";
import Link from "next/link";
import { Seal } from "@/components/brand/seal";
import { cn } from "@/lib/utils";

type ShellHeaderProps = {
  /** Navigation slot, rendered after the wordmark. */
  nav?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
  className?: string;
};

/** Header pane: wordmark in the display face, nav and actions as slots. */
export function ShellHeader({ nav, actions, className }: ShellHeaderProps) {
  return (
    <header
      className={cn(
        "relative flex h-12 items-stretch border-b border-hairline bg-background",
        className,
      )}
    >
      <Link
        href="/"
        className="group flex shrink-0 items-center gap-2.5 border-r border-hairline-faint px-3 sm:px-4 font-display text-[1.75rem] leading-none text-bone transition-colors hover:text-signal"
      >
        <Seal title="" aria-hidden className="size-6 text-signal-dim transition-colors group-hover:text-signal" />
        <span className="hidden sm:inline">Apocrypha</span>
      </Link>
      {nav && (
        <nav
          aria-label="Primary"
          className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto px-2 text-sm sm:px-3"
        >
          {nav}
        </nav>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2 px-2 sm:px-3">{actions}</div>
    </header>
  );
}
