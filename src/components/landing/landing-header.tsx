"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { ShellHeader } from "@/components/shell";
import { cn } from "@/lib/utils";

export const CHAPTERS = [
  { id: "holds", label: "What we hold" },
  { id: "design", label: "The design" },
  { id: "limits", label: "Limits" },
] as const;

/**
 * Sticky header for the landing page. A hairline under it fills with scroll
 * progress, and the chapter you are in is marked, so a long page never leaves
 * you wondering where you are.
 */
export function LandingHeader({ repo }: { repo: string }) {
  const [active, setActive] = useState<string | null>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 });

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
    const onScroll = () => {
      if (window.scrollY < 120) setActive(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="sticky top-0 z-40">
      <ShellHeader
        nav={
          <div className="hidden items-center gap-1 md:flex">
            {CHAPTERS.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                aria-current={active === c.id ? "location" : undefined}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  active === c.id && "text-signal",
                )}
              >
                {c.label}
              </a>
            ))}
          </div>
        }
        actions={
          <>
            <a href={repo} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Source
            </a>
            <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Sign in
            </Link>
          </>
        }
      />
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-signal"
      />
    </div>
  );
}
