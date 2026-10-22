"use client";

import { useSyncExternalStore } from "react";
import { motion } from "motion/react";

const PAGES = [
  { src: "page-1", x: 3, size: 130, dur: 110, delay: 0, rot: [-20, 28], dx: 50, alpha: 0.22 },
  { src: "page-4", x: 90, size: 86, dur: 150, delay: 40, rot: [12, -34], dx: -40, alpha: 0.14 },
  { src: "page-2", x: 93, size: 140, dur: 125, delay: 20, rot: [30, -12], dx: -60, alpha: 0.2 },
  { src: "page-5", x: 6, size: 92, dur: 160, delay: 70, rot: [-6, 38], dx: 36, alpha: 0.14 },
  { src: "page-3", x: 48, size: 70, dur: 200, delay: 100, rot: [18, -22], dx: 24, alpha: 0.08 },
] as const;

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const q = window.matchMedia(query);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

/**
 * The library behind the app screens. The painting is lit enough to read as a
 * place, a pool of dark sits under the content so panes read on flat dark, the
 * ink sea rises along the bottom edge, and single pages drift up through the
 * margins at their own pace. Decorative and behind solid panes.
 */
export function AppGround() {
  const still = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-ink">
      <motion.div
        className="absolute inset-0 bg-[url('/brand/hero-library.webp')] bg-cover bg-no-repeat [background-position:72%_55%] opacity-55 [filter:brightness(1.3)_blur(1.5px)]"
        animate={still ? undefined : { scale: [1.04, 1.14], x: ["0%", "-2%"] }}
        transition={{ duration: 80, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
      />

      {/* A dark pool under the content, thinning to the edges. */}
      <div className="absolute inset-0 [background:radial-gradient(ellipse_60%_75%_at_50%_46%,oklch(0.14_0.012_195/0.92),oklch(0.14_0.012_195/0.7)_65%,oklch(0.14_0.012_195/0.55))]" />
      {/* Sky haze at the top, ink at the foot. */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-miasma/15 to-transparent" />
      <motion.div
        className="mora-tex-ink-painted absolute inset-x-0 bottom-0 h-48 opacity-70 [mask-image:linear-gradient(to_top,#000_30%,transparent)]"
        animate={still ? undefined : { backgroundPositionX: ["0px", "-400px"] }}
        transition={{ duration: 120, ease: "linear", repeat: Infinity }}
      />

      {!still && (
        <div className="absolute inset-0 hidden min-[1400px]:block">
          {PAGES.map((p) => (
            <motion.div
              key={p.src}
              className="absolute top-0 bg-contain bg-center bg-no-repeat"
              style={{
                left: `${p.x}%`,
                width: p.size,
                height: p.size,
                opacity: p.alpha,
                filter: "blur(1px)",
                backgroundImage: `url(/brand/pages/${p.src}.webp)`,
              }}
              initial={{ y: "108vh", x: 0, rotate: p.rot[0] }}
              animate={{ y: "-24vh", x: p.dx, rotate: p.rot[1] }}
              transition={{ duration: p.dur, delay: p.delay * -1, ease: "linear", repeat: Infinity }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
