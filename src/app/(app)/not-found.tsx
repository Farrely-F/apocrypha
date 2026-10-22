import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { buttonVariants } from "@/components/ui/button";

// Shown inside the app for anything that does not exist or that this account may not open.
export default function AppNotFound() {
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
        <p className="text-bone">That page does not exist, or you don&apos;t have access to it.</p>
        <p>If someone sent you here, ask them to check your access.</p>
      </StatusPane>
    </div>
  );
}
