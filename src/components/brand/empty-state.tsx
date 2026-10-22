import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyArt } from "./empty-art";

/**
 * A finished empty state, not a gap: the sealed book centred under a soft
 * lantern glow on painted ink, a plain title, one sentence, and the action.
 * Sits flat inside the pane it is in; it is not a pane of its own.
 */
export function EmptyState({
  title,
  children,
  actions,
  className,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate grid min-h-[24rem] place-items-center overflow-hidden px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative grid w-full max-w-[34rem] justify-items-center gap-6 text-center">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-12 [background:radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--lamp)_7%,transparent),transparent_68%)]"
          />
          <EmptyArt className="relative w-40" />
        </div>
        <div className="grid justify-items-center gap-3">
          <h3 className="font-display text-2xl leading-none text-bone">{title}</h3>
          <p className="max-w-[48ch] text-sm text-bone-dim">{children}</p>
          {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
