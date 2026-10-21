import type { ReactNode } from "react";
import Link from "next/link";
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
        "flex h-12 items-stretch border-b border-hairline bg-background",
        className,
      )}
    >
      <Link
        href="/"
        className="flex items-center border-r border-hairline-faint px-4 font-display text-[1.75rem] leading-none text-bone transition-colors hover:text-signal"
      >
        Apocrypha
      </Link>
      {nav && (
        <nav
          aria-label="Primary"
          className="flex min-w-0 items-center gap-1 px-3 text-sm"
        >
          {nav}
        </nav>
      )}
      <div className="ml-auto flex items-center gap-2 px-3">{actions}</div>
    </header>
  );
}
