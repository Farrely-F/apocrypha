"use client";

import Link from "next/link";
import { StatusPane } from "@/components/brand/status-pane";
import { Button, buttonVariants } from "@/components/ui/button";

// An error inside the app keeps the header and status bar, so the vault stays reachable and lockable.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-2xl pt-6">
      <StatusPane
        code={error.digest ? `ref ${error.digest}` : "error"}
        title="Something went wrong"
        art="book"
        actions={
          <>
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
            <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Your workspace
            </Link>
          </>
        }
      >
        <p className="text-bone">That did not work, and nothing you stored was changed.</p>
        <p>Try again. Your vault is still open; use Lock in the status bar if you want to close it.</p>
      </StatusPane>
    </div>
  );
}
