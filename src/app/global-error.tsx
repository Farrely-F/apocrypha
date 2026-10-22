"use client";

import { Button } from "@/components/ui/button";
import "./globals.css";

// Last resort: the root layout itself failed, so this brings its own document.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="h-full bg-background font-sans">
      <body className="grid min-h-dvh place-items-center bg-background px-6 text-bone">
        <main className="grid max-w-md gap-4 border border-hairline p-6">
          <h1 className="text-lg">Something went wrong</h1>
          <p className="text-bone-dim">Apocrypha could not load. Nothing you stored was changed.</p>
          <Button size="sm" className="w-fit" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
