import { cn } from "@/lib/utils";
import { AppGround } from "./app-ground";
import { Pane } from "./pane";
import { ShellHeader } from "./shell-header";

function Bar({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-3 animate-pulse bg-pane-raised", className)} />;
}

/**
 * What a page looks like while it is on its way: the same header block and
 * panes as the real thing, drawn as quiet bars, with one terminal line saying
 * what is happening. Same layout as the loaded page, so nothing jumps.
 */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto grid max-w-[96rem] gap-x-6 gap-y-6 pt-2 lg:grid-cols-[minmax(0,1fr)_21rem]"
    >
      <header className="grid gap-3 border-b border-hairline-faint pb-5 lg:col-span-full">
        <Bar className="w-40" />
        <div aria-hidden className="h-9 w-64 animate-pulse bg-pane-raised" />
      </header>

      <Pane title="Loading" meta="opening the library" flush>
        <div className="grid gap-px pt-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-6 border-t border-hairline-faint px-5 py-4 first:border-t-0">
              <Bar className="w-4" />
              <Bar className={i % 2 ? "w-48" : "w-64"} />
              <Bar className="ml-auto hidden w-32 sm:block" />
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="mx-auto my-4 size-16 animate-pulse bg-contain bg-center bg-no-repeat opacity-60 [background-image:url('/brand/eye-seal.webp')]"
        />
        <p className="border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">
          <span className="text-signal">&gt;</span> opening the library
          <span aria-hidden className="mora-caret ml-1" />
        </p>
      </Pane>

      <aside className="hidden content-start gap-6 lg:grid">
        <Pane title="Details">
          <div className="grid gap-3">
            <Bar className="w-full" />
            <Bar className="w-5/6" />
            <Bar className="w-2/3" />
          </div>
        </Pane>
      </aside>
    </div>
  );
}

/** The whole app frame while the session and the workspace tree are read. */
export function AppLoading() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <ShellHeader />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AppGround />
        <div className="relative h-full overflow-y-auto p-4 sm:p-6">
          <PageSkeleton />
        </div>
      </div>
      <div aria-hidden className="h-8 border-t border-hairline bg-background" />
    </div>
  );
}
