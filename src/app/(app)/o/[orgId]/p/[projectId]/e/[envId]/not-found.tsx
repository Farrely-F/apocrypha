import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { buttonVariants } from "@/components/ui/button";

// Shown for an environment that does not exist or that this account holds no
// grant for. The two are deliberately indistinguishable.
export default function EnvironmentNotFound() {
  return (
    <div className="-m-4 flex w-[calc(100%+2rem)] sm:-m-6 sm:w-[calc(100%+3rem)]">
      <StatusPane
        code="404"
        title="No such folio"
        actions={
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Back to your workspace
          </Link>
        }
      >
        <p className="text-bone">No such environment, or you don&apos;t have access.</p>
        <p>Ask the person who shared it to check your access.</p>
      </StatusPane>
    </div>
  );
}
