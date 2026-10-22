"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, RotateCcw } from "lucide-react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Button } from "@/components/ui/button";
import { Pane } from "@/components/shell";
import { clamp01, resolveText } from "./scramble";
import { useReducedMotion } from "./use-reduced-motion";

export type Sample = {
  name: string;
  value: string;
  sealedName: string;
  sealedValue: string;
};

// Where on the 0..1 timeline each beat happens. One clock drives the whole picture,
// so every stage reads as a consequence of the one before it.
const SEAL = [0.08, 0.22] as const;
const SEND = [0.26, 0.46] as const;
const STORE = 0.5;
const FETCH = [0.58, 0.78] as const;
const OPEN = [0.82, 0.96] as const;
const DURATION = 9;

const CAPTIONS = [
  [0, "Your browser holds the value and the key for this environment."],
  [SEAL[0], "It seals the value before anything is sent."],
  [SEND[0], "Only ciphertext crosses the wire."],
  [STORE, "The server stores it. It has no key to open it."],
  [FETCH[0], "A teammate's browser fetches the same ciphertext."],
  [OPEN[0], "Their key, passed along an invite link the server never reads, opens it."],
] as const;

const span = (v: number, [from, to]: readonly [number, number]) => clamp01((v - from) / (to - from));
const ease = (p: number) => p * p * (3 - 2 * p);

/** A line that is plaintext, then noise settling into ciphertext (seal) or the reverse (open). */
function useScrambled(
  t: MotionValue<number>,
  plain: string,
  cipher: string,
  mode: "seal" | "open",
  window: readonly [number, number],
  seed: number,
) {
  return useTransform(t, (v) => {
    const p = span(v, window);
    const [before, after] = mode === "seal" ? [plain, cipher] : [cipher, plain];
    if (p <= 0) return before;
    if (p >= 1) return after;
    return resolveText(after, p, seed, Math.floor(v * 120));
  });
}

function Secret({
  t,
  sample,
  mode,
  window,
  seed,
}: {
  t: MotionValue<number>;
  sample: Sample;
  mode: "seal" | "open";
  window: readonly [number, number];
  seed: number;
}) {
  const name = useScrambled(t, sample.name, sample.sealedName, mode, window, seed);
  const value = useScrambled(t, sample.value, sample.sealedValue, mode, window, seed + 7);
  return (
    <div className="grid gap-1 font-mono text-xs leading-5 break-all">
      <motion.span className="text-bone">{name}</motion.span>
      <motion.span className="text-bone-dim">{value}</motion.span>
    </div>
  );
}

function KeyChip({ t, at, label }: { t: MotionValue<number>; at: number; label: string }) {
  const opacity = useTransform(t, (v) => (v >= at ? 1 : 0.2));
  return (
    <motion.p style={{ opacity }} className="flex items-center gap-1.5 text-xs text-signal">
      <KeyRound aria-hidden className="size-3.5" />
      {label}
    </motion.p>
  );
}

/**
 * The stretch between two panes. Wide screens run it sideways, narrow ones down.
 * It draws as its stage begins, and a square rides it to the far end.
 */
function Wire({ t, window, label }: { t: MotionValue<number>; window: readonly [number, number]; label: string }) {
  const p = useTransform(t, (v) => ease(span(v, window)));
  const pct = useTransform(p, (x) => `${x * 100}%`);
  const labelOpacity = useTransform(t, (v) => (v >= window[0] ? 1 : 0.2));
  const arrived = useTransform(p, (x) => (x >= 1 ? 1 : 0.25));
  const riding = useTransform(p, (x) => (x > 0 && x < 1 ? 1 : 0));

  return (
    <div className="relative flex items-center justify-center py-1 lg:px-1 lg:py-0">
      <motion.span
        style={{ opacity: labelOpacity }}
        className="absolute z-10 bg-background px-2 text-xs text-bone-faint max-lg:left-1/2 max-lg:ml-3 max-lg:-translate-y-0 max-lg:bg-transparent max-lg:px-0 max-lg:text-left lg:-top-6 lg:left-1/2 lg:-translate-x-1/2"
      >
        {label}
      </motion.span>

      {/* down */}
      <div className="relative h-16 w-px bg-hairline-faint lg:hidden">
        <motion.div style={{ scaleY: p }} className="absolute inset-0 origin-top bg-signal" />
        <motion.span
          style={{ top: pct, opacity: riding }}
          className="absolute left-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 border border-signal bg-signal"
        />
        <motion.span
          style={{ opacity: arrived }}
          className="absolute bottom-0 left-1/2 size-[7px] -translate-x-1/2 translate-y-1/2 border border-signal bg-background"
        />
      </div>

      {/* across */}
      <div className="relative hidden h-px w-full bg-hairline-faint lg:block">
        <motion.div style={{ scaleX: p }} className="absolute inset-0 origin-left bg-signal" />
        <motion.span
          style={{ left: pct, opacity: riding }}
          className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 border border-signal bg-signal"
        />
        <motion.span
          style={{ opacity: arrived }}
          className="absolute top-1/2 right-0 size-[7px] translate-x-1/2 -translate-y-1/2 border border-signal bg-background"
        />
      </div>
    </div>
  );
}

function ServerRow({ t, sample }: { t: MotionValue<number>; sample: Sample }) {
  const opacity = useTransform(t, (v) => (v >= STORE ? 1 : 0.14));
  return (
    <motion.div style={{ opacity }} className="grid gap-1 font-mono text-xs leading-5 break-all">
      <span className="text-bone">{sample.sealedName}</span>
      <span className="text-bone-dim">{sample.sealedValue}</span>
    </motion.div>
  );
}

/**
 * One secret, followed from one browser to another. A single clock plays the
 * whole journey once as the section arrives: sealed in the first browser,
 * carried as ciphertext, held by a server with no key, opened in the second
 * browser. Replay runs it again. With reduced motion, or before scripts run,
 * it is the finished picture.
 */
export function HowItWorks({ sample }: { sample: Sample }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const t = useMotionValue(1);
  const run = useRef<AnimationPlaybackControls | null>(null);
  const [done, setDone] = useState(true);
  const [stage, setStage] = useState(CAPTIONS.length - 1);

  useMotionValueEvent(t, "change", (v) => {
    let s = 0;
    CAPTIONS.forEach(([at], i) => {
      if (v >= at) s = i;
    });
    setStage((cur) => (cur === s ? cur : s));
    setDone(v >= 1);
  });

  const play = useCallback(() => {
    run.current?.stop();
    t.jump(0);
    run.current = animate(t, 1, { duration: DURATION, ease: "linear" });
  }, [t]);

  useEffect(() => {
    if (reduce || !inView) return;
    play();
    return () => run.current?.stop();
  }, [reduce, inView, play]);

  return (
    <section id="how" aria-labelledby="how-title" className="relative scroll-mt-14">
      <div className="mx-auto w-full max-w-[96rem] px-6 py-24 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h2 id="how-title" className="font-display text-4xl text-bone">
              How it works
            </h2>
            <p className="mt-4 max-w-[52ch] text-bone-dim">
              Follow one secret from your browser to a teammate&apos;s. The key
              stays in browsers the whole way. The server only ever passes
              ciphertext along.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={play} disabled={reduce || !done}>
            <RotateCcw data-icon="inline-start" />
            Replay
          </Button>
        </div>

        <p className="sr-only">
          The sender&apos;s browser seals the secret with the environment key. Only the ciphertext is sent. The
          server stores the ciphertext and holds no key. A teammate&apos;s browser fetches it and opens it with its own
          copy of the key.
        </p>

        <div ref={ref} aria-hidden className="mt-14">
          <div className="grid items-stretch lg:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(4.5rem,8rem)_minmax(0,1fr)_minmax(4.5rem,8rem)_minmax(0,1fr)]">
            <Pane title="Your browser" meta="sender" tone="signal" className="h-full">
              <div className="grid gap-4 py-1">
                <Secret t={t} sample={sample} mode="seal" window={SEAL} seed={3} />
                <KeyChip t={t} at={SEAL[0]} label="env key · dev" />
              </div>
            </Pane>

            <Wire t={t} window={SEND} label="ciphertext" />

            <Pane title="Our server" meta="stores" className="h-full">
              <div className="grid gap-4 py-1">
                <ServerRow t={t} sample={sample} />
                <p className="flex items-center gap-1.5 text-xs text-blood-bright">
                  <KeyRound aria-hidden className="size-3.5" />
                  no key
                </p>
              </div>
            </Pane>

            <Wire t={t} window={FETCH} label="ciphertext" />

            <Pane title="Teammate's browser" meta="reader" tone="signal" className="h-full">
              <div className="grid gap-4 py-1">
                <Secret t={t} sample={sample} mode="open" window={OPEN} seed={11} />
                <KeyChip t={t} at={OPEN[0]} label="env key · dev" />
              </div>
            </Pane>
          </div>

          <p className="mt-10 min-h-6 font-mono text-[0.8125rem] text-bone-dim">
            <span className="text-signal">&gt;</span> {CAPTIONS[stage][1]}
          </p>
        </div>
      </div>
    </section>
  );
}
