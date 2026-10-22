import { NextResponse, type NextRequest } from "next/server";
import { cspFor, newNonce } from "@/lib/security/csp";

const dev = process.env.NODE_ENV !== "production";

/**
 * Sets the Content Security Policy for every page. A fresh nonce goes into the policy and into the request,
 * so Next puts it on every script it renders (see lib/security/csp.ts for which pages are strict).
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = cspFor(request.nextUrl.pathname, nonce, dev);

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API, built assets, or the image files.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand|icons).*)",
      // The router's own prefetches fetch data, never a document. A browser's document prefetch
      // (Purpose: prefetch) still gets a policy, because it can be shown later.
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
