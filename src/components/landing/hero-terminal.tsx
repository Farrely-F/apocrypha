"use client";

import FaultyTerminal from "@/components/FaultyTerminal";

/**
 * The glyph field behind the hero. Bright on purpose: the octopus is black and
 * reads as a shape against it. FaultyTerminal already pauses off screen and in
 * hidden tabs, and holds still for reduced motion. Decorative.
 */
export function HeroTerminal() {
  return (
    <div aria-hidden className="absolute inset-0 z-0">
      <FaultyTerminal
        tint="#3ddc97"
        glyphs="characters"
        brightness={0.8}
        scanlineIntensity={0.35}
        curvature={0.1}
        glow={0.5}
        vignette={0.25}
        digitSize={3}
        timeScale={0.25}
        mouseReact
        clickEffect="glitch"
        variation={undefined}
        dpr={undefined}
        style={undefined}
      />
    </div>
  );
}
