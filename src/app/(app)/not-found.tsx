import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { buttonVariants } from "@/components/ui/button";

// Shown inside the app for anything that does not exist or that this account may not open.
export default function AppNotFound() {
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
        <p className="text-bone">That page does not exist, or you don&apos;t have access.</p>
        <p>Ask the person who sent you here to check your access.</p>
      </StatusPane>
    </div>
  );
}
