"use client";

import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { AuthStage } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AuthStage>
      <StatusPane
        code={error.digest ? `ref ${error.digest}` : "error"}
        title="Something went wrong"
        art="book"
        actions={
          <>
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
            <Link href="/" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Back to the start
            </Link>
          </>
        }
      >
        <p className="text-bone">That did not work, and nothing you stored was changed.</p>
        <p>Try again. If it keeps happening, check your connection and reload.</p>
      </StatusPane>
    </AuthStage>
  );
}
