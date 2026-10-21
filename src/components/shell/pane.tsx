import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PaneProps = Omit<ComponentProps<"section">, "title"> & {
  /** Section title, set into the top border in the display face. */
  title?: ReactNode;
  /** Short mono annotation set into the top border, right side. */
  meta?: ReactNode;
  /** Border tone. `danger` is for destructive surfaces only. */
  tone?: "default" | "signal" | "danger";
  /** Remove body padding (lists, tables, editors that own their own). */
  flush?: boolean;
};

const toneBorder = {
  default: "border-hairline",
  signal: "border-signal-dim",
  danger: "border-blood",
} as const;

/**
 * A pane is a 1px outlined region with its title notched into the top edge,
 * like a terminal window frame. Panes sit side by side; never nest a pane
 * inside a pane. Use <Divider /> to partition inside one.
 */
export function Pane({
  title,
  meta,
  tone = "default",
  flush = false,
  className,
  children,
  ...props
}: PaneProps) {
  const hasHead = title != null || meta != null;
  return (
    <section
      className={cn(
        "relative min-w-0 border bg-background",
        toneBorder[tone],
        className,
      )}
      {...props}
    >
      {hasHead && (
        <header className="relative h-0">
          <div className="pointer-events-none absolute inset-x-3 top-0 flex -translate-y-1/2 items-center justify-between gap-3">
            {title != null && (
              <h2 className="bg-background px-2 font-display text-xl leading-none text-bone">
                {title}
              </h2>
            )}
            {meta != null && (
              <span className="bg-background px-2 text-xs leading-none text-bone-faint">
                {meta}
              </span>
            )}
          </div>
        </header>
      )}
      <div className={cn(!flush && "p-4", hasHead && !flush && "pt-6")}>
        {children}
      </div>
    </section>
  );
}
