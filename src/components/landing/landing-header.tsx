"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  LayoutGroup,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { Seal } from "@/components/brand/seal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignedIn } from "./use-signed-in";

export const CHAPTERS = [
  { id: "holds", label: "What we hold" },
  { id: "design", label: "The design" },
  { id: "limits", label: "Limits" },
] as const;

/**
 * Header. Over the painting it is a bare bar. After the first scroll it draws
 * itself in to a floating blurred pill, and a soft highlight slides to the
 * chapter you are reading. Sign in only joins once the hero's own call to
 * action has scrolled away, so there is never a second primary button beside
 * the first.
 */
export function LandingHeader({ repo }: { repo: string }) {
  const [pill, setPill] = useState(false);
  const [late, setLate] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const signedIn = useSignedIn();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    setPill((cur) => (cur === y > 40 ? cur : y > 40));
    setLate((cur) => {
      const next = y > window.innerHeight * 0.7;
      return cur === next ? cur : next;
    });
    if (y < 120) setActive(null);
  });

  useEffect(() => {
    const els = CHAPTERS.map((c) => document.getElementById(c.id)).filter(
      (el): el is HTMLElement => el != null,
    );
    // The chapter crossing the middle of the viewport is the current one.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -54% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <header
      style={{ pointerEvents: "none" }}
      className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 sm:px-4"
    >
      <div
        style={{
          pointerEvents: "auto",
          maxWidth: pill ? "80rem" : "96rem",
          transition:
            "max-width 500ms cubic-bezier(0.16, 1, 0.3, 1), margin-top 500ms cubic-bezier(0.16, 1, 0.3, 1), height 500ms cubic-bezier(0.16, 1, 0.3, 1), padding 500ms, background-color 300ms, border-color 300ms, border-radius 500ms",
        }}
        className={cn(
          "flex w-full items-center gap-3 border",
          // Same container as the page: 96rem wide, text aligned with the content below.
          "max-w-384 px-6 sm:px-10",
          pill
            ? "mt-3 h-14 rounded-full border-bone/5 bg-background/50 backdrop-blur-xl backdrop-saturate-150"
            : "mt-0 h-14 rounded-none border-transparent bg-transparent backdrop-blur-none",
        )}
      >
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 text-bone"
        >
          <Seal
            title=""
            aria-hidden
            className="size-6 text-signal-dim transition-colors group-hover:text-signal"
          />
          <span className="font-display text-[1.55rem] leading-none font-semibold transition-colors group-hover:text-signal">
            Apocrypha
          </span>
        </Link>

        <LayoutGroup>
          <nav
            aria-label="Chapters"
            className="mx-auto hidden items-center gap-1 md:flex"
          >
            {CHAPTERS.map((c) => {
              const on = active === c.id;
              return (
                <a
                  key={c.id}
                  href={`#${c.id}`}
                  aria-current={on ? "location" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-1 text-sm whitespace-nowrap transition-colors",
                    on ? "text-bone" : "text-bone-dim hover:text-bone",
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="landing-nav-highlight"
                      aria-hidden
                      transition={{
                        type: "spring",
                        stiffness: 480,
                        damping: 40,
                      }}
                      className="absolute inset-0 rounded-full bg-bone/10"
                    />
                  )}
                  <span className="relative">{c.label}</span>
                </a>
              );
            })}
          </nav>
        </LayoutGroup>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
          <a
            href={repo}
            className={cn(
              "group/src hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm text-bone-dim transition-colors hover:text-bone",
              pill ? "lg:hidden" : "lg:flex",
            )}
          >
            Source
            <ArrowUpRight className="size-3 transition-transform group-hover/src:translate-x-px group-hover/src:-translate-y-px" />
          </a>
          <Link
            href={signedIn ? "/dashboard" : "/sign-in"}
            className={cn(
              buttonVariants({
                variant: late || signedIn ? "default" : "ghost",
                size: "sm",
              }),
              "rounded-full px-4",
            )}
          >
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}
