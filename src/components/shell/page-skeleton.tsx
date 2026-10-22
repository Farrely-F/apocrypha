import { cn } from "@/lib/utils";
import { AppGround } from "./app-ground";
import { Pane } from "./pane";
import { ShellHeader } from "./shell-header";

function Bar({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-3 animate-pulse bg-pane-raised", className)} />;
}

/**
 * What a page looks like while it is on its way: the same title block, table
 * and action, drawn as quiet bars, with one terminal line saying what is
 * happening. Same layout, so nothing jumps.
 */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto w-full max-w-[100rem] pb-10 pt-1"
    >
      <header className="flex flex-wrap items-end justify-between gap-6 pb-6">
        <div className="min-w-0">
          <Bar className="h-16 w-72 max-w-full" />
          <Bar className="mt-3 h-2 w-80 max-w-full" />
        </div>
        <Bar className="mb-1 h-7 w-28" />
      </header>

      <div className="mt-6">
        <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
          <div className="mt-3 grid gap-px">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-6 border-t border-hairline-faint px-5 py-4 first:border-t-0">
                <Bar className={i % 2 ? "w-48" : "w-64"} />
                <Bar className="ml-auto hidden w-32 sm:block" />
              </div>
            ))}
          </div>
          <p className="border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">
            <span className="text-signal">&gt;</span> opening the library
            <span aria-hidden className="mora-caret ml-1" />
          </p>
        </Pane>
      </div>
    </div>
  );
}

/** The whole app frame while the session and the workspace tree are read. */
export function AppLoading() {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <AppGround />
      <ShellHeader className="relative z-10" />
      <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full overflow-y-auto p-4 sm:p-6">
          <PageSkeleton />
        </div>
      </div>
      <div aria-hidden className="h-8" />
    </div>
  );
}
