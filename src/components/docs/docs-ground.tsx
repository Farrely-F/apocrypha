"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "@/components/landing/use-reduced-motion";

/**
 * The landscape from the landing page's hero (the drowned library and its arch) held behind the docs.
 * It drifts very slowly, and a veil keeps the reading column dark: the painting's own dark left side sits
 * under the text and the arch stays at the right edge. It is fixed, so the page scrolls over it.
 */
export function DocsGround() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-abyss">
      <motion.div
        className="absolute -inset-[6%] bg-[url('/brand/hero-library.webp')] bg-cover bg-[position:72%_42%] opacity-[0.62] [filter:saturate(0.85)_brightness(0.9)]"
        animate={reduce ? undefined : { x: ["0%", "-2.5%", "0%"], y: ["0%", "1.5%", "0%"], scale: [1.02, 1.08, 1.02] }}
        transition={{ duration: 90, ease: "easeInOut", repeat: Infinity }}
      />
      {/* Dark under the text on the left, easing off toward the arch. */}
      <div className="absolute inset-0 [background:linear-gradient(90deg,oklch(0.14_0.012_195/0.92)_0%,oklch(0.14_0.012_195/0.72)_42%,oklch(0.14_0.012_195/0.34)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-abyss via-abyss/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 [background:linear-gradient(to_top,var(--abyss)_6%,transparent)]" />
    </div>
  );
}
