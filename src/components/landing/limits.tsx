"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { Pane } from "@/components/shell";
import { useReducedMotion } from "./use-reduced-motion";

export type Limit = { term: string; text: string };

/** Ledger rows that draw their rule in as they arrive. Content is readable without it. */
export function Limits({ limits }: { limits: readonly Limit[] }) {
  return (
    <section
      id="limits"
      aria-labelledby="limits-title"
      className="mx-auto w-full max-w-[96rem] scroll-mt-12 px-6 py-24 sm:px-10"
    >
      <Pane
        title={<span id="limits-title">Limits, up front</span>}
        meta={<span className="hidden sm:inline">read before you trust it</span>}
        flush
      >
        <ul className="pt-3">
          {limits.map((limit, i) => (
            <Row key={limit.term} limit={limit} first={i === 0} />
          ))}
        </ul>
      </Pane>
    </section>
  );
}

function Row({ limit, first }: { limit: Limit; first: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const shown = reduce || seen;

  return (
    <li ref={ref} className="relative grid gap-x-8 gap-y-1 px-5 py-6 md:grid-cols-[1.25rem_minmax(0,22rem)_minmax(0,1fr)]">
      {!first && (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scaleX: shown ? 1 : 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-x-0 top-0 h-px origin-left bg-hairline-faint"
        />
      )}
      <span aria-hidden className="text-blood-bright">
        !
      </span>
      <motion.h3
        initial={false}
        animate={{ opacity: shown ? 1 : 0.2 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="text-bone"
      >
        {limit.term}
      </motion.h3>
      <motion.p
        initial={false}
        animate={{ opacity: shown ? 1 : 0.2 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="max-w-[58ch] text-bone-dim"
      >
        {limit.text}
      </motion.p>
    </li>
  );
}
