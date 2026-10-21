"use client";

import { useSyncExternalStore } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * One world behind the whole page. The hero's painting is fixed in place and
 * you travel through it: it slowly zooms from the arch down to the ink sea, and a
 * veil of the page color thickens as the chapters begin, so the text always sits
 * on dark and the library only ever shows at the edges. A few single pages drift
 * by in the margins at different speeds. There is nothing else behind the page.
 */

// Each page crosses the middle of the screen at scroll `at`, at `speed` times the
// speed of the content (under 1 is far away, over 1 is close).
const PAGES = [
  { src: "page-1", at: 1500, speed: 0.55, side: "left", edge: 2.5, size: 150, rot: -18, blur: 0, alpha: 0.5 },
  { src: "page-4", at: 3100, speed: 0.4, side: "right", edge: 4, size: 90, rot: 12, blur: 2, alpha: 0.32 },
  { src: "page-2", at: 4700, speed: 0.65, side: "right", edge: 2, size: 170, rot: 24, blur: 0, alpha: 0.5 },
  { src: "page-5", at: 6200, speed: 0.4, side: "left", edge: 5, size: 100, rot: -8, blur: 2, alpha: 0.32 },
  { src: "page-3", at: 7700, speed: 0.6, side: "left", edge: 2, size: 160, rot: 16, blur: 0, alpha: 0.5 },
  { src: "page-8", at: 9000, speed: 0.45, side: "right", edge: 3.5, size: 95, rot: -22, blur: 1, alpha: 0.36 },
] as const;

const noop = () => () => {};

function FloatingPage({ page, scrollY }: { page: (typeof PAGES)[number]; scrollY: MotionValue<number> }) {
  const y = useTransform(scrollY, (v) => window.innerHeight / 2 + (page.at - v) * page.speed);
  const rotate = useTransform(scrollY, (v) => page.rot + (v - page.at) * 0.012);
  return (
    <motion.div
      aria-hidden
      style={{
        y,
        rotate,
        width: page.size,
        height: page.size,
        opacity: page.alpha,
        filter: page.blur ? `blur(${page.blur}px)` : undefined,
        backgroundImage: `url(/brand/pages/${page.src}.webp)`,
        [page.side]: `${page.edge}%`,
      }}
      className="absolute top-0 -mt-20 bg-contain bg-center bg-no-repeat"
    />
  );
}

export function PageGround() {
  const reduce = useReducedMotion();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const { scrollY, scrollYProgress: p } = useScroll();

  const scale = useTransform(p, [0, 1], [1, reduce ? 1 : 1.4]);
  const origin = useTransform(p, (v) => `${70 - 20 * v}% ${38 + 62 * v}%`);
  // Clear for the hero, dark through the chapters, thinning at the foot so the sea shows.
  const veil = useTransform(p, [0, 0.1, 0.85, 1], [0, 0.8, 0.8, 0.45]);
  // Keeps the headline on dark for the hero only; the veil takes over after.
  const scrim = useTransform(p, [0, 0.07], [1, 0]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink">
      <motion.div
        style={{ scale, transformOrigin: origin }}
        className="absolute inset-0 bg-[url('/brand/hero-library.webp')] bg-cover bg-no-repeat [background-position:80%_center] will-change-transform lg:[background-position:72%_center]"
      />
      <motion.div
        style={{ opacity: scrim }}
        className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/45 to-background/10 lg:bg-gradient-to-r lg:from-background/70 lg:via-background/25 lg:to-transparent"
      />
      <motion.div
        style={{ opacity: veil }}
        className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,var(--abyss),transparent_100%),linear-gradient(var(--abyss),var(--abyss))]"
      />
      {hydrated && !reduce && (
        <div className="absolute inset-0 hidden min-[1700px]:block">
          {PAGES.map((page) => (
            <FloatingPage key={page.src} page={page} scrollY={scrollY} />
          ))}
        </div>
      )}
    </div>
  );
}
