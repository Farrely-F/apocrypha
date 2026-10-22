import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { buttonVariants } from "@/components/ui/button";

// Shown for an environment that does not exist or that this account holds no
// grant for. The two are deliberately indistinguishable.
export default function EnvironmentNotFound() {
  return (
    <div className="mx-auto flex max-w-2xl pt-6">
      <StatusPane
        code="404"
        title="Not found"
        actions={
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Back to your workspace
          </Link>
        }
      >
        <p className="text-bone">No such environment, or you don&apos;t have access to it.</p>
        <p>If someone shared it with you, ask them to check your access.</p>
      </StatusPane>
    </div>
  );
}
