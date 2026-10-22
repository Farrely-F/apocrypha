"use client";

import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { AuthStage } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AuthStage ground={false} flush>
      <StatusPane
        code={error.digest ? `ref ${error.digest}` : "error"}
        title="A page tore"
        art="book"
        actions={
          <>
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
            <Link href="/" className={buttonVariants({ size: "sm", variant: "secondary", className: "border-hairline" })}>
              Back to the start
            </Link>
          </>
        }
      >
        <p className="text-bone">That did not work. Nothing you stored was changed.</p>
        <p>Try again. If it keeps happening, reload the page.</p>
      </StatusPane>
    </AuthStage>
  );
}
