"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { Pane } from "@/components/shell";
import { cn } from "@/lib/utils";
import { InkLayer } from "./fx-layers";
import { clamp01, resolveText } from "./scramble";
import { useReducedMotion } from "./use-reduced-motion";

export type LedgerRow = {
  name: string;
  value: string;
  sealedName: string;
  sealedValue: string;
};

// Scroll position, 0..1, at which each stage of the story happens. Row i seals
// between ROW_START + i * ROW_GAP and the same plus ROW_SPAN.
const ROW_START = 0.12;
const ROW_GAP = 0.2;
const ROW_SPAN = 0.3;
const STEPS = 100; // quantised so a re-render only happens when the picture changes

const WIDE = "(min-width: 64rem)";
const noopSubscribe = () => () => {};
const subscribeWide = (cb: () => void) => {
  const q = window.matchMedia(WIDE);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

const rowProgress = (p: number, i: number) => clamp01((p - (ROW_START + i * ROW_GAP)) / ROW_SPAN);

function caption(p: number) {
  if (p < ROW_START) return "In your browser, the values are readable. Keep scrolling.";
  if (p < ROW_START + 2 * ROW_GAP + ROW_SPAN) return "Sealing. Each value is encrypted here, then sent.";
  return "This is everything our server stores about them.";
}

/**
 * Pinned stage: scroll scrubs three secrets from plaintext in the browser to
 * ciphertext on the server. Without JavaScript, or with reduced motion, it is
 * the finished ledger and nothing moves.
 */
export function ServerLedger({ rows }: { rows: readonly LedgerRow[] }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Server render and first paint are the finished state; scrubbing starts after hydration.
  const live = useSyncExternalStore(
    noopSubscribe,
    () => !reduce,
    () => false,
  );
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [scrub, setScrub] = useState<number | null>(null);

  useMotionValueEvent(scrollYProgress, "change", (v) => setScrub(Math.round(clamp01(v) * STEPS) / STEPS));

  const p = live ? (scrub ?? Math.round(clamp01(scrollYProgress.get()) * STEPS) / STEPS) : 1;
  const step = Math.round(p * STEPS);
  const inkOn = live && wide && p > 0.55;

  return (
    <section
      ref={ref}
      id="holds"
      aria-labelledby="holds-title"
      className="relative scroll-mt-12 motion-safe:h-[320svh] motion-reduce:h-auto"
    >
      <div className="mx-auto flex w-full max-w-[96rem] flex-col justify-center gap-8 px-6 py-16 sm:px-10 motion-safe:sticky motion-safe:top-12 motion-safe:min-h-[calc(100svh-3rem)] motion-safe:py-10">
        <div>
          <p className="max-w-[62ch] text-bone-dim">
            The same three secrets, as you see them and as we store them. Names
            are sealed along with the values.
          </p>
        </div>

        <Pane
          title={<span id="holds-title">What the server holds</span>}
          meta="sample values"
          flush
          tone={live && p >= 0.85 ? "signal" : "default"}
          className="transition-colors duration-500"
        >
          <div className="relative pt-3">
            {inkOn && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-[calc(50%-3rem)] border-l border-hairline-faint lg:block"
              >
                <InkLayer active />
              </div>
            )}

            <div className="relative z-10 grid lg:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]">
              <p className="border-b border-hairline px-5 py-3 text-bone">In your browser</p>
              <span aria-hidden className="hidden border-b border-hairline lg:block" />
              <p className="hidden border-b border-hairline px-5 py-3 text-bone lg:block">
                On our server
              </p>

              {rows.map((row, i) => {
                const r = live ? rowProgress(p, i) : 1;
                const started = r > 0;
                const sealed = r >= 1;
                return (
                  <div key={row.name} className="contents">
                    <p
                      className={cn(
                        "px-5 py-4 break-all",
                        i > 0 && "border-t border-hairline-faint",
                        "lg:col-start-1",
                      )}
                    >
                      <span className="text-bone-dim">{row.name}</span>
                      <span className="text-bone-faint">=</span>
                      <span
                        className={cn(
                          "transition-colors duration-300",
                          sealed ? "text-bone-dim" : "text-bone",
                        )}
                      >
                        {row.value}
                      </span>
                    </p>

                    <div
                      aria-hidden
                      className={cn(
                        "relative hidden items-center px-2 lg:flex",
                        i > 0 && "border-t border-hairline-faint",
                      )}
                    >
                      <span className="h-px w-full bg-hairline-faint" />
                      <span
                        className="absolute inset-x-2 h-px origin-left bg-signal"
                        style={{ transform: `scaleX(${r})` }}
                      />
                      <span
                        className={cn(
                          "absolute size-1.5 -translate-x-1/2 bg-signal transition-opacity",
                          started && !sealed ? "opacity-100" : "opacity-0",
                        )}
                        style={{ left: `calc(0.5rem + (100% - 1rem) * ${r})` }}
                      />
                    </div>

                    <div
                      className={cn(
                        "px-5 py-4 break-all",
                        "border-t border-hairline-faint lg:col-start-3",
                        i === 0 && "lg:border-t-0",
                      )}
                    >
                      <span className="mb-1 block text-xs text-bone-faint lg:hidden">
                        On our server
                      </span>
                      {started ? (
                        <>
                          <p className="text-signal">
                            {resolveText(row.sealedName, r, i * 2 + 1, step)}
                          </p>
                          <p className="text-signal-dim">
                            {resolveText(row.sealedValue, r, i * 2 + 2, step)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-bone-faint">nothing yet</p>
                          <p className="text-bone-faint">&nbsp;</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Pane>

        <p aria-hidden className="min-h-6 text-sm text-bone-dim motion-reduce:hidden">
          <span className="text-signal">&gt;</span> {caption(p)}
        </p>
      </div>
    </section>
  );
}

