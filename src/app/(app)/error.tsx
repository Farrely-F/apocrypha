"use client";

import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { Button, buttonVariants } from "@/components/ui/button";

// An error inside the app keeps the header and status bar, so the vault stays reachable and lockable.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="-m-4 flex w-[calc(100%+2rem)] sm:-m-6 sm:w-[calc(100%+3rem)]">
      <StatusPane
        code={error.digest ? `ref ${error.digest}` : "error"}
        title="A page tore"
        art="book"
        actions={
          <>
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
            <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "secondary", className: "border-hairline" })}>
              Your workspace
            </Link>
          </>
        }
      >
        <p className="text-bone">That did not work. Nothing you stored was changed.</p>
        <p>Try again. Your vault is still open.</p>
      </StatusPane>
    </div>
  );
}
