"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Pane } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/components/landing/use-reduced-motion";
import { dockEdge, placeCard, type Box, type Size } from "@/lib/tour/place";
import { markSeen, takePending, type Store } from "@/lib/tour/storage";
import { activeSteps, pickAnchor, TOUR_STEPS, type TourStep } from "@/lib/tour/steps";

type TourApi = { start: () => void };
const TourContext = createContext<TourApi | null>(null);

/** Start the tour again, from the palette. A no-op outside the app frame. */
export function useTour(): TourApi {
  return useContext(TourContext) ?? { start: () => {} };
}

const NO_STORE: Store = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
function store(kind: "localStorage" | "sessionStorage"): Store {
  try {
    return window[kind];
  } catch {
    return NO_STORE;
  }
}

/** The first on-screen element carrying one of the `data-tour` names. */
function findAnchor(names: readonly string[]): HTMLElement | null {
  for (const name of names) {
    const hit = pickAnchor(
      [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, width: r.width, height: r.height };
      }),
    );
    if (hit) return hit;
  }
  return null;
}

// A dialog counts only while it is on screen: hidden or kept-mounted ones must not hold the tour back.
const dialogOpen = () =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

/**
 * Wraps the unlocked app. A brand-new vault gets the tour once, on the first
 * screen after setup; anyone can start it again with `useTour().start()`.
 */
export function TourProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const claimed = useRef<boolean | null>(null);

  const start = useCallback(() => {
    const list = activeSteps(TOUR_STEPS, (t) => findAnchor([t]) != null);
    if (list.length > 0) setSteps(list);
  }, []);

  const close = useCallback(() => {
    setSteps(null);
    markSeen(store("localStorage"), userId);
  }, [userId]);

  useEffect(() => {
    // Strict mode runs this twice; the flag may only be spent once.
    claimed.current ??= takePending(store("sessionStorage"), store("localStorage"), userId);
    if (!claimed.current) return;
    // Wait for the environment's key to open (so the toolbar exists) and for
    // any dialog to close, but not forever.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const ready = findAnchor(["add", "registry"]) != null || tries > 12;
      if (tries > 30) return window.clearInterval(timer);
      if (dialogOpen() || !ready) return;
      window.clearInterval(timer);
      start();
    }, 450);
    return () => window.clearInterval(timer);
  }, [userId, start]);

  const api = useMemo(() => ({ start }), [start]);
  return (
    <TourContext.Provider value={api}>
      {children}
      {steps && createPortal(<TourRun steps={steps} onClose={close} />, document.body)}
    </TourContext.Provider>
  );
}

const SMALL = "(min-width: 40rem)";
const subscribeSmall = (cb: () => void) => {
  const q = window.matchMedia(SMALL);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
const PAD = 6;
const CARD_W = 352;

function TourRun({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<Size>(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const cardRef = useRef<HTMLElement | null>(null);
  const maskId = useId().replace(/:/g, "");
  const still = useReducedMotion();
  const wide = useSyncExternalStore(subscribeSmall, () => window.matchMedia(SMALL).matches, () => true);

  const step = steps[index];
  const last = index === steps.length - 1;
  const hasTarget = Boolean(step.target);
  // A step is only worth showing while its anchor is still on the page.
  const ok = (s: TourStep) => !s.target || findAnchor(s.target) != null;

  const go = useCallback(
    (dir: 1 | -1) => {
      let j = index + dir;
      while (j >= 0 && j < steps.length && !ok(steps[j])) j += dir;
      if (j >= steps.length) return onClose();
      if (j >= 0) setIndex(j);
    },
    [index, steps, onClose],
  );

  // Follow the anchor: bring it into view, then track scroll, resize and size changes.
  useEffect(() => {
    if (!step.target) return;
    const el = findAnchor(step.target);
    let raf = 0;
    const measure = () => {
      if (!el || !el.isConnected) return go(1);
      const r = el.getBoundingClientRect();
      setTarget({ x: r.x, y: r.y, w: r.width, h: r.height });
      setView({ w: window.innerWidth, h: window.innerHeight });
    };
    raf = requestAnimationFrame(() => {
      el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      measure();
    });
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
    };
  }, [step, go]);

  // The card's own size decides where it can sit.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const box = e.borderBoxSize?.[0];
      setSize({ w: box?.inlineSize ?? el.offsetWidth, h: box?.blockSize ?? el.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Focus the card on each step; give focus back when the tour ends. The page
  // under it is told the tour is running so Ctrl K does not open the palette.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    document.documentElement.setAttribute("data-tour-active", "");
    return () => {
      document.documentElement.removeAttribute("data-tour-active");
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Enter" && e.target === cardRef.current) {
        e.preventDefault();
        go(1);
      } else if (e.key === "Tab" && cardRef.current) {
        const items = [...cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        const first = items[0];
        const end = items[items.length - 1];
        const at = document.activeElement;
        if (e.shiftKey && (at === first || at === cardRef.current)) {
          e.preventDefault();
          end?.focus();
        } else if (!e.shiftKey && at === end) {
          e.preventDefault();
          first?.focus();
        } else if (!cardRef.current.contains(at)) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  const t = hasTarget ? target : null;
  const hole = t
    ? { x: t.x - PAD, y: t.y - PAD, width: t.w + PAD * 2, height: t.h + PAD * 2, opacity: 1 }
    : { x: view.w / 2, y: view.h / 2, width: 0, height: 0, opacity: 0 };
  const move = still ? { duration: 0 } : { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const };

  const card = size ?? { w: CARD_W, h: 220 };
  const spot = wide ? placeCard(t, card, view) : null;
  const edge = dockEdge(t, view.h);
  const measured = size != null && (!hasTarget || t != null);

  return (
    <div className="fixed inset-0 z-[70]" data-testid="tour">
      {/* Blocks the page: a tour is for reading, and a stray click should not act on it. */}
      <div className="absolute inset-0" />
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            <motion.rect fill="black" initial={false} animate={hole} transition={move} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="oklch(0.11 0.012 195)" fillOpacity={0.7} mask={`url(#${maskId})`} />
      </svg>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 border border-signal-dim"
        initial={false}
        animate={{ x: hole.x, y: hole.y, width: hole.width, height: hole.height, opacity: hole.opacity }}
        transition={move}
      />

      <motion.div
        className={wide ? "absolute top-0 left-0" : `absolute inset-x-3 ${edge === "top" ? "top-3" : "bottom-3"}`}
        style={{ width: wide ? CARD_W : undefined, visibility: measured ? "visible" : "hidden" }}
        initial={false}
        animate={spot ? { x: spot.left, y: spot.top } : { x: 0, y: 0 }}
        transition={move}
      >
        <Pane
          ref={cardRef as React.Ref<HTMLElement>}
          tone="signal"
          title={step.title}
          meta={`${index + 1} / ${steps.length}`}
          role="dialog"
          aria-label={step.title}
          tabIndex={-1}
          className="outline-none"
        >
          <motion.div
            key={step.id}
            initial={still ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            aria-live="polite"
          >
            <p className="text-sm leading-relaxed text-bone-dim">{step.body}</p>
          </motion.div>
          <div className="mt-4 flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="-ml-2.5 text-bone-faint" onClick={onClose}>
              Skip tour
            </Button>
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => go(-1)} disabled={index === 0}>
              Back
            </Button>
            <Button type="button" size="sm" onClick={() => go(1)}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </Pane>
      </motion.div>
    </div>
  );
}
