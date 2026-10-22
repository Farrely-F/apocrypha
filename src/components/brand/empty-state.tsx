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
        "relative isolate mt-5 grid min-h-[22rem] place-items-center overflow-hidden border border-hairline-faint px-6 py-12 text-center",
        className,
      )}
    >
      <div aria-hidden className="mora-tex-ink-painted absolute inset-0 -z-20 opacity-60" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background:radial-gradient(ellipse_55%_60%_at_50%_38%,color-mix(in_oklch,var(--lamp)_9%,transparent),transparent_70%),radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.14_0.012_195/0.2),oklch(0.14_0.012_195/0.85))]"
      />
      <div className="grid justify-items-center gap-3">
        <EmptyArt className="w-32" />
        <h3 className="mt-3 text-lg text-bone">{title}</h3>
        <p className="max-w-[46ch] text-bone-dim">{children}</p>
        {actions && <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
