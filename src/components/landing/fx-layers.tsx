"use client";

import Dither from "@/components/Dither";
import { ditherDim } from "./fx-presets";

/** Dithered ink that fades in behind the sample pane while it is sealed. */
export function InkLayer({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
      style={{ opacity: active ? 0.55 : 0 }}
    >
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
  );
}
