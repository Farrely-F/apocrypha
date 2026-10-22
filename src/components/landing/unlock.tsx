"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { Seal } from "@/components/brand/seal";
import { Pane } from "@/components/shell";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "./use-reduced-motion";
import { useSignedIn } from "./use-signed-in";

/**
 * The closing beat and the page's one lamp. As you arrive, the pane that held
 * everything sealed turns to lamp gold and the seal lights from within. Lamp is the open-and-ready color,
 * used once, here.
 */
export function Unlock({ repo }: { repo: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const signedIn = useSignedIn();
  const lit = useInView(ref, { amount: 0.55 }) || reduce;

  return (
    <section
      ref={ref}
      id="unlock"
      aria-labelledby="unlock-title"
      className="relative isolate z-10"
    >
      <div className="relative z-10 mx-auto grid w-full max-w-[96rem] px-6 py-28 sm:px-10 lg:py-36">
        <Pane
          title={<span id="unlock-title">Make a vault</span>}
          tone="signal"
          style={{ "--frame-corner": lit ? "var(--lamp)" : "var(--signal-dim)" } as React.CSSProperties}
          className={cn(
            "mora-frame-corners w-full max-w-xl transition-[border-color] duration-700",
            lit && "border-lamp-dim!",
          )}
        >
          <div className="grid gap-5 py-2">
            <div className="relative w-fit">
              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: lit ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 1.6, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 [background:radial-gradient(closest-side,color-mix(in_oklch,var(--lamp)_22%,transparent),transparent)]"
              />
              <Seal
                title="Apocrypha seal"
                className={cn(
                  "relative size-14 transition-colors duration-700",
                  lit ? "text-lamp" : "text-signal-dim",
                )}
              />
            </div>
            <p className="max-w-[44ch] text-bone">
              Sign in, choose a passphrase, and seal your first .env. Everything
              you store after that is encrypted before it leaves this browser.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/sign-in"} className={buttonVariants({ size: "lg" })}>
                {signedIn ? "Open your dashboard" : "Sign in with GitHub"}
              </Link>
              <a href={repo} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Read the source
              </a>
            </div>
            <p className="text-xs text-bone-faint">
              Early development. The crypto is unaudited, so don&apos;t store anything you can&apos;t rotate.
            </p>
          </div>
        </Pane>
      </div>
    </section>
  );
}
