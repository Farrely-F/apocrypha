"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useReducedMotion } from "./use-reduced-motion";
import { buttonVariants } from "@/components/ui/button";
import { HeroTerminal } from "./hero-terminal";

/**
 * The first screen. The painted library sits behind a near-black left third, so
 * the headline reads on flat dark. Scrolling away pushes the painting back and
 * lets the haze close over it, which is how the page descends into the next
 * chapter.
 */
export function Hero({ repo }: { repo: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const paintY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "14%"]);
  const paintScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.1]);
  const pagesY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "-38%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "-12%"]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0.15]);
  const haze = useTransform(scrollYProgress, [0.1, 1], [0, reduce ? 0 : 0.92]);

  return (
    <section
      ref={ref}
      className="relative isolate flex min-h-[calc(100svh-3rem)] flex-col overflow-hidden border-b border-hairline bg-ink"
    >
      {/* Painted library. Its own element so the scroll transform never touches text. */}
      <motion.div
        aria-hidden
        style={{ y: paintY, scale: paintScale }}
        className="absolute inset-0 z-0 origin-[70%_40%] bg-[url('/brand/hero-library.webp')] bg-cover bg-no-repeat [background-position:80%_center] lg:[background-position:72%_center]"
      />
      {/* Glyph field in the dark left third only, dim enough to read over. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 z-[1] w-full opacity-45 [mask-image:linear-gradient(to_right,#000_0%,transparent_58%)] lg:w-[62%]"
      >
        <HeroTerminal />
      </div>
      {/* Pages drifting at a different rate than the painting give it depth. */}
      <motion.div
        aria-hidden
        style={{ y: pagesY }}
        className="absolute inset-y-0 right-0 z-[2] w-[min(60%,34rem)] bg-[url('/brand/drifting-pages.webp')] bg-[length:380px_auto] bg-repeat opacity-[0.14]"
      />
      {/* Legibility scrim: whole frame on narrow screens, left column on wide. */}
      <div
        aria-hidden
        className="absolute inset-0 z-[3] bg-gradient-to-b from-background/80 via-background/45 to-background/10 lg:bg-gradient-to-r lg:from-background/70 lg:via-background/25 lg:to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 z-[3] h-40 bg-gradient-to-t from-background to-transparent"
      />
      <motion.div
        aria-hidden
        style={{ opacity: haze }}
        className="mora-tex-miasma absolute inset-0 z-[4]"
      />
      {/* Opening beat: the ink lifts off the library once. */}
      <div aria-hidden className="hero-veil absolute inset-0 z-[5] bg-ink" />

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 mx-auto flex w-full max-w-[96rem] flex-1 flex-col justify-center px-6 pt-[10svh] pb-[16svh] sm:px-10"
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
          <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
            Sign in with GitHub
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
