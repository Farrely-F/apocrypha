"use client";

import { useSyncExternalStore } from "react";

/**
 * The CSP nonce this page was rendered with, for the rare library that injects a <style> or <script> of its
 * own. Browsers hide the attribute from the DOM but keep it on the element's `nonce` property.
 *
 * `null` on the server and during hydration (not known yet), then the nonce, or "" on a page that has none.
 * A caller that must not inject anything before it has the nonce waits for a non-null value.
 */
export function useCspNonce(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "",
    () => null,
  );
}
