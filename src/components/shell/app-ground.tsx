"use client";

import { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import Dither from "@/components/Dither";
import { ditherDim } from "@/components/landing/fx-presets";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const q = window.matchMedia(query);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

/**
 * The app sits in the abyss below the library: ink, not architecture. A quiet
 * field of dark water under one cold signal glow; the glyph field moves slowly.
 */
export function AppGround() {
  const still = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-abyss">

      <motion.div
        className="absolute inset-0 bg-[url('/brand/ink-sea-tile.webp')] bg-repeat opacity-45 [background-size:650px_auto] [filter:brightness(0.82)_saturate(0.8)_blur(1px)]"
        animate={still ? undefined : { backgroundPositionX: ["0px", "-650px"] }}
        transition={{ duration: 180, ease: "linear", repeat: Infinity }}
      />

      {/* The dark pool that keeps the page title and tables readable. */}
      <div className="absolute inset-0 [background:radial-gradient(ellipse_82%_90%_at_42%_42%,oklch(0.14_0.012_195/0.94)_0%,oklch(0.14_0.012_195/0.78)_58%,oklch(0.14_0.012_195/0.4)_100%)]" />

      {/* A faint dithered ink current, the effect used on the landing ledger. */}
      <div className="absolute inset-0 opacity-20 [mask-image:linear-gradient(to_top,#000_0%,#000_46%,transparent_94%)]">
        <Dither
          waveColor={[...ditherDim.waveColor]}
          backgroundColor={[...ditherDim.backgroundColor]}
          colorNum={ditherDim.colorNum}
          pixelSize={ditherDim.pixelSize}
          waveAmplitude={ditherDim.waveAmplitude}
          waveSpeed={ditherDim.waveSpeed}
          brightness={ditherDim.brightness}
          enableMouseInteraction={ditherDim.enableMouseInteraction}
          clickRipple={ditherDim.clickRipple}
          palette={undefined}
          dpr={undefined}
          style={undefined}
        />
      </div>

      {/* Slow teal weather at the edges: the room is not empty. */}
      <motion.div
        className="absolute -top-[18%] -right-[18%] h-[58rem] w-[58rem] [background:radial-gradient(circle,oklch(0.52_0.1_165/0.24),transparent_68%)]"
        animate={still ? undefined : { x: [0, -46, 0], y: [0, 34, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 82, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        className="absolute -bottom-[22%] -left-[20%] h-[52rem] w-[52rem] [background:radial-gradient(circle,oklch(0.78_0.16_160/0.1),transparent_70%)]"
        animate={still ? undefined : { x: [0, 38, 0], y: [0, -30, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 96, ease: "easeInOut", repeat: Infinity }}
      />
      {/* Cold light from the far side, and a faint reflection below. */}
      <div className="absolute inset-0 [background:radial-gradient(40%_48%_at_96%_4%,oklch(0.52_0.1_165/0.15),transparent_74%)]" />
      <div className="absolute inset-0 [background:radial-gradient(42%_44%_at_62%_86%,oklch(0.52_0.1_165/0.07),transparent_74%)]" />
      <div className="absolute inset-0 [background:radial-gradient(34%_40%_at_4%_100%,oklch(0.52_0.1_165/0.06),transparent_72%)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-abyss via-abyss/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-44 [background:linear-gradient(to_top,var(--abyss)_10%,transparent)]" />

      {/* The leaning bookshelf from the painting, cropped out once, large and dim in the lower right. */}
      <div
        aria-hidden
        className="absolute right-0 bottom-0 hidden h-[54rem] w-[45.4rem] -scale-x-100 bg-[url('/brand/bookshelf.webp')] bg-contain bg-right-bottom bg-no-repeat opacity-[0.4] [mask-image:radial-gradient(ellipse_62%_72%_at_42%_62%,#000_35%,transparent_80%)] md:block"
      />
      {/* And the same bookshelf the other way round, in the lower left. */}
      <div
        aria-hidden
        className="absolute left-0 bottom-0 hidden h-[54rem] w-[45.4rem] bg-[url('/brand/bookshelf.webp')] bg-contain bg-left-bottom bg-no-repeat opacity-[0.4] [mask-image:radial-gradient(ellipse_62%_72%_at_42%_62%,#000_35%,transparent_80%)] md:block"
      />
    </div>
  );
}
