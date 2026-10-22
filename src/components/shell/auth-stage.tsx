import type { ReactNode } from "react";
import Link from "next/link";
import { Seal } from "@/components/brand/seal";
import { cn } from "@/lib/utils";

/**
 * The painted library behind the gates (sign in, unlock, vault setup, invites).
 * Same painting as the landing page, held still and slowly drifting, darkened
 * on the left where the form sits so it always reads on flat dark. Decorative
 * and behind a solid pane, as the effects rules in DESIGN.md section 14 ask.
 */
export function AuthGround() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-ink">
      <div className="auth-ground absolute inset-0" />
      <div className="auth-scrim absolute inset-0" />
    </div>
  );
}

/** A full page gate: the painted ground, a wordmark back to the landing page, and the content. */
export function AuthStage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background">
      <AuthGround />
      <header className="relative z-10 mx-auto flex w-full max-w-[96rem] items-center px-6 py-5 sm:px-10">
        <Link href="/" className="group flex items-center gap-2.5 text-bone">
          <Seal title="" aria-hidden className="size-6 text-signal-dim transition-colors group-hover:text-signal" />
          <span className="font-display text-[1.65rem] leading-none font-semibold transition-colors group-hover:text-signal">
            Apocrypha
          </span>
        </Link>
      </header>
      <main
        id="main"
        className={cn(
          "relative z-10 mx-auto flex w-full max-w-[96rem] flex-1 justify-center px-6 pb-16 sm:px-10",
          wide ? "items-start pt-4" : "items-center lg:justify-start",
        )}
      >
        {children}
      </main>
    </div>
  );
}
