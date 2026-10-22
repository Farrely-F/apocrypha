/**
 * Content Security Policy, built per request.
 *
 * The page that decrypts secrets must not run a script it was not given. Pages that handle credentials or
 * keys are rendered per request and every script on them carries a fresh nonce, with 'strict-dynamic' so the
 * chunks those scripts load are trusted and nothing injected is. There is no 'unsafe-inline' and no
 * 'unsafe-eval' for scripts there.
 *
 * The few pages that are prerendered at build time (the landing page, the goodbye page) have inline bootstrap
 * scripts that cannot carry a per-request nonce, so they keep 'unsafe-inline'. They hold no credentials or
 * keys. Which side a route is on is decided by STRICT_PREFIXES, and a test fails if a new route is added
 * without being classified.
 */

/** Top-level path segments rendered per request, where credentials, keys or unlocked data exist. */
export const STRICT_PREFIXES = ["sign-in", "two-factor", "vault", "dashboard", "settings", "o", "join", "s"] as const;

/** Top-level routes that are prerendered, with no credentials or keys on them. */
export const STATIC_ROUTES = ["", "goodbye", "specimen"] as const;

export function isStrictRoute(pathname: string): boolean {
  const first = pathname.split("/")[1] ?? "";
  return (STRICT_PREFIXES as readonly string[]).includes(first);
}

/**
 * True when following a link from a document loaded under the relaxed policy to `targetPath` would keep that
 * relaxed policy on a page that needs the strict one (a client-side navigation reuses the document).
 */
export function crossesPolicyBoundary(documentIsStrict: boolean, targetPath: string): boolean {
  return !documentIsStrict && isStrictRoute(targetPath);
}

type Options = { nonce: string; dev?: boolean };

const common = (dev: boolean) => [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

/** Pages that handle credentials, keys or unlocked data. */
export function strictCsp({ nonce, dev = false }: Options): string {
  return [
    ...common(dev),
    // 'wasm-unsafe-eval' is for Argon2id (hash-wasm); it does not allow eval() or new Function().
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Stylesheets are files; the one library that injects a <style> (input-otp) is given the nonce.
    // Style attributes (animation, layout values) cannot run code and are allowed.
    // (In development the dev server injects its own <style> elements, so there it is 'unsafe-inline'; a nonce
    // in the same list would switch 'unsafe-inline' off.)
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
  ].join("; ");
}

/** Prerendered pages with no credentials or keys. */
export function staticCsp({ dev = false }: { dev?: boolean } = {}): string {
  return [
    ...common(dev),
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
  ].join("; ");
}

export function cspFor(pathname: string, nonce: string, dev = false): string {
  return isStrictRoute(pathname) ? strictCsp({ nonce, dev }) : staticCsp({ dev });
}

/** 128 bits from the platform's CSPRNG, base64. Never reused between requests. */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
