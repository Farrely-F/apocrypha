import Link from "next/link";
import { AppShell, Pane, ShellHeader } from "@/components/shell";

// Shown for an environment that does not exist or that this account holds no
// grant for. The two are deliberately indistinguishable.
export default function EnvironmentNotFound() {
  return (
    <AppShell header={<ShellHeader />} status={null}>
      <div className="mx-auto max-w-2xl pt-6">
        <Pane title="Not found" meta="404">
          <p className="text-bone">No such environment, or you don&apos;t have access to it.</p>
          <p className="mt-4">
            <Link
              href="/dashboard"
              className="text-signal underline decoration-signal-dim underline-offset-4 hover:decoration-signal"
            >
              Back to your workspace
            </Link>
          </p>
        </Pane>
      </div>
    </AppShell>
  );
}
