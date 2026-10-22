"use client";

import { useEffect, useState } from "react";
import { crossesPolicyBoundary, isStrictRoute } from "@/lib/security/csp";

/**
 * A Content Security Policy belongs to the document, and a client-side navigation does not load a new one. So
 * someone who opens the prerendered landing page (relaxed policy) and follows a link to the unlock screen would
 * type their passphrase under that relaxed policy. This turns such a link into a full page load, which gets the
 * strict policy. It does nothing on a document that already has the strict policy: moving around the app stays
 * a client-side navigation.
 *
 * It listens at the document, so a link added to a public page later is covered without anyone remembering.
 */
export function PolicyBoundary() {
  // What this document was loaded with. It does not change when the client router swaps pages in.
  const [strict] = useState(() => typeof window !== "undefined" && isStrictRoute(window.location.pathname));

  useEffect(() => {
    if (strict) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !crossesPolicyBoundary(strict, url.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(url.href);
    };
    // Capture phase, so it runs before the router's own click handler.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [strict]);

  return null;
}
