import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const q = window.matchMedia(QUERY);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
}

/**
 * False on the server and during hydration, then the real preference. Anything
 * rendered from it matches the server HTML on the first pass, so there is no
 * hydration mismatch for visitors who ask for reduced motion.
 */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
