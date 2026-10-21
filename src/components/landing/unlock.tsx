"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { Seal } from "@/components/brand/seal";
import { Pane } from "@/components/shell";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * The closing beat and the page's one lamp. As you arrive, the lamplight comes
 * up on the stones, and the pane that held everything sealed turns to lamp
 * gold. Lamp is the open-and-ready color, used once, here.
 */
export function Unlock({ repo }: { repo: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const lit = useInView(ref, { amount: 0.55 }) || !!reduce;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const stone = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0, 1]);
  const drift = useTransform(scrollYProgress, [0, 1], ["6%", "0%"]);

  return (
    <section
      ref={ref}
      id="unlock"
      aria-labelledby="unlock-title"
      className="relative isolate overflow-hidden border-t border-hairline bg-ink"
    >
      <motion.div
        aria-hidden
        style={{ opacity: stone, y: reduce ? 0 : drift }}
        className="mora-bg-lamplit absolute inset-0 z-0 [background-position:right_top]"
      />
      <div
        aria-hidden
        className="absolute inset-0 z-[1] bg-gradient-to-r from-background via-background/80 to-background/10"
      />

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
            <Seal
              title="Apocrypha seal"
              className={cn(
                "size-14 transition-colors duration-700",
                lit ? "text-lamp" : "text-signal-dim",
              )}
            />
            <p className="max-w-[44ch] text-bone">
              Sign in, choose a passphrase, and seal your first .env. Everything
              you store after that is encrypted before it leaves this browser.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
                Sign in with GitHub
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
