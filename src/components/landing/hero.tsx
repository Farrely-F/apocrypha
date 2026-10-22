"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useReducedMotion } from "./use-reduced-motion";
import { buttonVariants } from "@/components/ui/button";
import { HeroTerminal } from "./hero-terminal";
import { useSignedIn } from "./use-signed-in";

/**
 * The first screen. The painting behind it is the page-wide ground (see
 * PageGround), dark on its left third so the headline reads on flat dark.
 * Scrolling away lifts the text out as the ground starts its descent.
 */
export function Hero({ repo }: { repo: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const signedIn = useSignedIn();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const textY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "-12%"]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0.15]);

  return (
    <section
      ref={ref}
      className="relative isolate z-10 flex min-h-svh flex-col overflow-hidden"
    >
      {/* Glyph field in the dark left third only, dim enough to read over. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 z-[1] w-full opacity-45 [mask-image:linear-gradient(to_right,#000_0%,transparent_58%)] lg:w-[62%]"
      >
        <div className="size-full [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
          <HeroTerminal />
        </div>
      </div>
      {/* Opening beat: the ink lifts off the library once. */}
      <div aria-hidden className="hero-veil absolute inset-0 z-[5] bg-ink" />

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 mx-auto flex w-full max-w-[96rem] flex-1 flex-col justify-center px-6 pt-[14svh] pb-[18svh] sm:px-10"
      >
        <h1 className="font-display text-[clamp(3.75rem,11vw,8.5rem)] leading-[0.9] font-semibold text-bone">
          Apocrypha
        </h1>
        <p className="mt-7 max-w-[24ch] text-2xl leading-snug text-bone text-balance sm:max-w-[34ch]">
          Your .env files, sealed in your browser before they leave it.
        </p>
        <p className="mt-4 max-w-[52ch] text-bone-dim">
          Keep the environment variables for every project in one place, share
          them with the people in your org, and pick them up on any machine. Our
          server stores ciphertext and can&apos;t read it.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href={signedIn ? "/dashboard" : "/sign-in"} className={buttonVariants({ size: "lg" })}>
            {signedIn ? "Open your dashboard" : "Sign in with GitHub"}
          </Link>
          <a href={repo} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Read the source
          </a>
        </div>
        <p className="mt-5 text-xs text-bone-faint">
          Early development. The crypto is unaudited.
        </p>
      </motion.div>

      <a
        href="#holds"
        className="group absolute bottom-6 left-6 z-10 flex items-center gap-3 text-xs text-bone-dim transition-colors hover:text-signal sm:left-10"
      >
        <span aria-hidden className="h-px w-10 bg-hairline transition-colors group-hover:bg-signal" />
        See what our server holds
        <span aria-hidden className="mora-caret" />
      </a>
    </section>
  );
}
