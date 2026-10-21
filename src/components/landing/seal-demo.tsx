"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pane } from "@/components/shell";
import { InkLayer } from "./fx-layers";

// Obviously fake sample values: this is a demo, nothing here is sent anywhere.
const SAMPLE = [
  ["DATABASE_URL", "postgres://app:hunter2@db.internal/prod"],
  ["STRIPE_SECRET_KEY", "sk_live_example_not_a_real_key"],
  ["SENTRY_DSN", "https://abc123@o0.ingest.sentry.io/1"],
] as const;

const GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_|#%";
const NAME_WIDTH = Math.max(...SAMPLE.map(([name]) => name.length));

const HOLD_MS = 1100; // let the plaintext be read before it seals
const LINE_STAGGER_MS = 140;
const LINE_MS = 650;
const TICK_MS = 45;

type Mode = "plain" | "sealed";

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/** Looks like the stored form: version, algorithm, then random base64url. */
function fakeCiphertext(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => GLYPHS[b % 64]).join("");
  return `v1|a256gcm|${body}`.slice(0, Math.min(Math.max(length, 24), 28));
}

/** Characters resolve left to right; the rest are noise until their turn. */
function frameAt(from: string, to: string, progress: number) {
  if (progress >= 1) return to;
  const width = Math.max(from.length, to.length);
  const resolved = Math.floor(progress * to.length);
  let out = to.slice(0, resolved);
  for (let i = resolved; i < width; i++) out += randomGlyph();
  return out;
}

export function SealDemo() {
  const plain = SAMPLE.map(([, value]) => value as string);
  const [shown, setShown] = useState<string[]>(plain);
  const [mode, setMode] = useState<Mode>("plain");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<string[]>(plain);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (hold.current) clearTimeout(hold.current);
    timer.current = null;
    hold.current = null;
  };

  const go = useCallback((target: Mode, instant = false) => {
    stop();
    const from = current.current;
    const to =
      target === "plain"
        ? SAMPLE.map(([, value]) => value as string)
        : SAMPLE.map(([, value]) => fakeCiphertext(value.length));

    const finish = () => {
      current.current = to;
      setShown(to);
      setMode(target);
      setBusy(false);
    };

    if (instant) {
      finish();
      return;
    }

    setBusy(true);
    const start = performance.now();
    timer.current = setInterval(() => {
      const t = performance.now() - start;
      const next = to.map((line, i) =>
        frameAt(from[i], line, (t - i * LINE_STAGGER_MS) / LINE_MS),
      );
      setShown(next);
      if (t >= LINE_MS + (to.length - 1) * LINE_STAGGER_MS) {
        stop();
        finish();
      }
    }, TICK_MS);
  }, []);

  // The one orchestrated moment: show the plaintext, then seal it.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Deferred even for reduced motion, so state is never set during the effect body.
    hold.current = setTimeout(() => go("sealed", reduce), reduce ? 0 : HOLD_MS);
    return stop;
  }, [go]);

  return (
    <Pane title=".env" meta="sample" tone="signal">
      <InkLayer active={mode === "sealed" && !busy} />
      <div className="relative z-10">
      <div
        aria-hidden
        className="overflow-hidden font-mono text-[0.8125rem] leading-6 break-all"
      >
        {SAMPLE.map(([name], i) => (
          <p key={name} className="grid grid-cols-[auto_1fr] gap-x-2">
            <span className="text-bone-dim">
              {name.padEnd(NAME_WIDTH, " ")}
            </span>
            <span className={mode === "sealed" && !busy ? "text-signal" : "text-bone"}>
              <span className="text-bone-faint">=</span>
              {shown[i]}
            </span>
          </p>
        ))}
      </div>
      <p role="status" className="sr-only">
        {mode === "sealed"
          ? "The sample values are sealed."
          : "The sample values are readable."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => go(mode === "sealed" ? "plain" : "sealed")}
        >
          {mode === "sealed" ? "Reveal values" : "Seal again"}
        </Button>
        <span className="text-xs text-bone-faint">
          {mode === "sealed"
            ? "This is what our server stores."
            : "This is what only your browser can see."}
        </span>
      </div>
      </div>
    </Pane>
  );
}
