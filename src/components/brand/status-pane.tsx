import type { ReactNode } from "react";
import { Pane } from "@/components/shell";
import { cn } from "@/lib/utils";

/**
 * The pane for pages that are not there (404) or went wrong (error): the gate
 * painting on one side, a plain sentence and the way out on the other. Same
 * voice as the rest: say what happened, then what to do.
 */
export function StatusPane({
  code,
  title,
  children,
  actions,
  art = "gate",
  className,
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  art?: "gate" | "book";
  className?: string;
}) {
  return (
    <Pane title={title} meta={code} className={cn("mora-frame-corners w-full max-w-2xl", className)}>
      <div className="grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
        <div
          aria-hidden
          className={cn(
            "hidden aspect-[3/4] border border-hairline-faint bg-ink bg-cover bg-center sm:block",
            art === "gate"
              ? "[background-image:linear-gradient(rgb(0_0_0/0.3),rgb(0_0_0/0.3)),url('/brand/archway-gate.webp')]"
              : "[background-image:linear-gradient(rgb(0_0_0/0.45),rgb(0_0_0/0.45)),url('/brand/empty-state-book.webp')]",
          )}
        />
        <div className="grid gap-4">
          <div className="grid gap-2 text-bone-dim">{children}</div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </Pane>
  );
}
