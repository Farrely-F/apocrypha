import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ShellHeader } from "./shell-header";
import { StatusBar } from "./status-bar";

type AppShellProps = {
  header?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Full-viewport frame: header pane, scrolling main, status bar.
 * Header and status default to the placeholder skeletons; later issues
 * pass real ones in. No effects live here: shell chrome stays flat.
 */
export function AppShell({
  header = <ShellHeader />,
  status = <StatusBar />,
  children,
  className,
}: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      {header}
      <main
        id="main"
        className={cn("min-h-0 flex-1 overflow-y-auto p-4 sm:p-6", className)}
      >
        {children}
      </main>
      {status}
    </div>
  );
}
