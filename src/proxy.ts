import { NextResponse, type NextRequest } from "next/server";
import { cspFor, newNonce, staticCsp } from "@/lib/security/csp";
import { hideAdminPage, isAdminPath, NOT_FOUND_PATH } from "@/lib/system/hide";

const dev = process.env.NODE_ENV !== "production";

/**
 * Sets the Content Security Policy for every page. A fresh nonce goes into the policy and into the request,
 * so Next puts it on every script it renders (see lib/security/csp.ts for which pages are strict).
 */
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  // The administrator's pages do not exist for anyone else: the answer is the one an unknown path gets, with the
  // same policy, decided here before a byte is streamed (see lib/system/hide.ts).
  const hidden = isAdminPath(request.nextUrl.pathname) && (await hideAdminPage(async () => (await import("@/lib/auth/auth")).auth.api.getSession({ headers: request.headers })));
  const csp = hidden ? staticCsp({ dev }) : cspFor(request.nextUrl.pathname, nonce, dev);

  const requestId = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = hidden ? NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { request: { headers } }) : NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-request-id", requestId);
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
