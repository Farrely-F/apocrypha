"use client";

import { useRef, useState, type ComponentType } from "react";
import {
  motion,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  type MotionValue,
} from "motion/react";
import { Pane } from "@/components/shell";
import { cn } from "@/lib/utils";
import { clamp01 } from "./scramble";
import { useReducedMotion } from "./use-reduced-motion";
import { InviteVisual, KeysVisual, SignInVisual, VaultVisual } from "./design-visuals";

export type DesignStep = {
  term: string;
  text: string;
  pane: string;
};

const VISUALS: ComponentType<{ t: MotionValue<number> }>[] = [
  SignInVisual,
  VaultVisual,
  KeysVisual,
  InviteVisual,
];

const DONE = motionValue(1);

function Visual({ i, t }: { i: number; t: MotionValue<number> }) {
  const V = VISUALS[i];
  return <V t={t} />;
}

/**
 * Four steps beside a sticky pane. Scrolling moves the pane from one step's
 * picture to the next and draws each picture as you read it. Below the large
 * breakpoint the pictures sit under their step, already drawn.
 */
export function DesignChapter({ steps }: { steps: readonly DesignStep[] }) {
  const reduce = useReducedMotion();
  const list = useRef<HTMLOListElement>(null);
  const { scrollY } = useScroll();
  const [active, setActive] = useState(0);
  // Draw progress of the active step's picture, and how far down the rail you have read.
  const t = useMotionValue(0);
  const rail = useMotionValue(0);

  // Read the page, not a ratio of it: the step nearest the middle of the viewport is
  // the current one, and its picture draws as that step travels up to the middle.
  useMotionValueEvent(scrollY, "change", () => {
    const ol = list.current;
    if (!ol) return;
    const mid = window.innerHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    let bestOffset = 0;
    Array.from(ol.children).forEach((li, i) => {
      const r = li.getBoundingClientRect();
      const offset = r.top + r.height / 2 - mid;
      if (Math.abs(offset) < bestDist) {
        bestDist = Math.abs(offset);
        best = i;
        bestOffset = offset;
      }
    });
    setActive((cur) => (cur === best ? cur : best));
    t.set(reduce ? 1 : clamp01(1 - bestOffset / (window.innerHeight * 0.38)));
    const olRect = ol.getBoundingClientRect();
    rail.set(clamp01((mid - olRect.top) / olRect.height));
  });

  return (
    <section
      id="design"
      aria-labelledby="design-title"
      className="relative scroll-mt-14"
    >
      <div className="mx-auto grid w-full max-w-[96rem] gap-10 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16">
        <div className="relative">
          <h2 id="design-title" className="font-display text-4xl text-bone">
            The design
          </h2>

          <div className="relative mt-10 pl-8">
            <div aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-hairline-faint" />
            <motion.div
              aria-hidden
              style={{ scaleY: rail }}
              className="absolute top-0 bottom-0 left-0 w-px origin-top bg-signal"
            />
            <ol ref={list} className="grid gap-16 lg:gap-0">
              {steps.map((step, i) => (
                <li
                  key={step.term}
                  className="relative lg:flex lg:min-h-[85svh] lg:items-center"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1.5 -left-8 size-[7px] -translate-x-1/2 border bg-background transition-colors duration-200 lg:top-[calc(50%-0.5rem)]",
                      i <= active ? "border-signal bg-signal" : "border-hairline",
                    )}
                  />
                  <div
                    className={cn(
                      "transition-opacity duration-300 lg:opacity-35",
                      i === active && "lg:opacity-100",
                    )}
                  >
                    <h3 className="text-lg text-bone">{step.term}</h3>
                    <p className="mt-2 max-w-[48ch] text-bone-dim">{step.text}</p>

                    {/* Narrow screens: the picture sits under its step, finished. */}
                    <div className="mt-6 lg:hidden">
                      <Pane title={step.pane}>
                        <StaticVisual i={i} />
                      </Pane>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-[max(5rem,calc(50svh-12rem))]">
            <Pane
              title={steps[active].pane}
              meta={`${active + 1} of ${steps.length}`}
              className="min-h-[19rem]"
            >
              <div key={active} className="mora-flicker">
                <Visual i={active} t={t} />
              </div>
            </Pane>
          </div>
        </div>
      </div>
    </section>
  );
}

function StaticVisual({ i }: { i: number }) {
  const V = VISUALS[i];
  return <V t={DONE} />;
}
