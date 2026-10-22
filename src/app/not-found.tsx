import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { AuthStage } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <AuthStage>
      <StatusPane
        code="404"
        title="Not found"
        actions={
          <>
            <Link href="/" className={buttonVariants({ size: "sm" })}>
              Back to the start
            </Link>
            <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Your workspace
            </Link>
          </>
        }
      >
        <p className="text-bone">There is nothing at this address.</p>
        <p>The link may be old or mistyped.</p>
      </StatusPane>
    </AuthStage>
  );
}
