import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "../../../next.config";
import { proxy } from "../../proxy";
import { crossesPolicyBoundary, cspFor, isStrictRoute, newNonce, staticCsp, STATIC_ROUTES, strictCsp, STRICT_PREFIXES } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d === name || d.startsWith(`${name} `)) ?? "";
const APP = join(process.cwd(), "src/app");

describe("strict policy (pages with credentials, keys or unlocked data)", () => {
  const csp = strictCsp({ nonce: "NONCE" });
  it("lets scripts run only with the nonce: no unsafe-inline, no eval", () => {
    const script = directive(csp, "script-src");
    expect(script).toContain("'nonce-NONCE'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).toContain("'wasm-unsafe-eval'"); // Argon2id only; does not enable eval()
    expect(directive(csp, "script-src-attr")).toBe("script-src-attr 'none'");
  });
  it("only allows a style element that carries the nonce", () => {
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'nonce-NONCE'");
  });
  it("talks to nobody but itself, and cannot be framed, embedded or re-based", () => {
    expect(csp).not.toMatch(/https?:|wss?:|\*/);
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "frame-src 'none'"]) {
      expect(csp.split("; ")).toContain(d);
    }
  });
  it("allows eval, websockets and inline styles only in development", () => {
    const dev = strictCsp({ nonce: "N", dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(directive(dev, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });
});

describe("static policy (prerendered pages with nothing to protect)", () => {
  const csp = staticCsp();
  it("is as closed everywhere except inline scripts, which a prerendered shell needs", () => {
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/https?:|wss?:|\*/);
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp.split("; ")).toContain("frame-ancestors 'none'");
  });
});

describe("which pages get which", () => {
  it("puts every page that takes a passphrase, a key or a session on the strict policy", () => {
    for (const p of ["/sign-in", "/two-factor", "/vault/new", "/vault/reset", "/dashboard", "/settings", "/o/x/p/y/e/z", "/o/x/settings", "/join/abc", "/s/abc", "/admin", "/admin/users"]) {
      expect(isStrictRoute(p), p).toBe(true);
    }
    for (const p of ["/", "/goodbye", "/specimen", "/robots.txt", "/no-such-page"]) expect(isStrictRoute(p), p).toBe(false);
  });

  it("fails when a route is added without deciding which policy it gets", () => {
    const top = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (!e.isDirectory()) return [];
        if (e.name === "api" || e.name.startsWith("_")) return [];
        if (e.name.startsWith("(")) return top(join(dir, e.name));
        return [e.name];
      });
    const known = new Set<string>([...STRICT_PREFIXES, ...STATIC_ROUTES]);
    const segments = top(APP).filter((s) => !s.startsWith("["));
    expect(segments.filter((s) => !known.has(s))).toEqual([]);
  });

  it("renders every strict page per request, because a prerendered shell cannot carry the nonce", () => {
    const owners = (prefix: string): string => {
      for (const base of [APP, ...readdirSync(APP, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("(")).map((e) => join(APP, e.name))]) {
        if (existsSync(join(base, prefix))) return base === APP ? join(APP, prefix) : base;
      }
      throw new Error(`no route directory for ${prefix}`);
    };
    for (const prefix of STRICT_PREFIXES) {
      const layout = join(owners(prefix), "layout.tsx");
      expect(existsSync(layout), `${prefix}: ${layout}`).toBe(true);
      expect(readFileSync(layout, "utf8"), prefix).toContain("await connection()");
    }
  });
});

describe("moving from a relaxed page into a strict one", () => {
  it("is a full page load, because the client router would keep the relaxed policy", () => {
    expect(crossesPolicyBoundary(false, "/dashboard")).toBe(true);
    expect(crossesPolicyBoundary(false, "/sign-in")).toBe(true);
    expect(crossesPolicyBoundary(false, "/s/abc")).toBe(true);
  });
  it("stays a client-side navigation everywhere else", () => {
    expect(crossesPolicyBoundary(true, "/dashboard")).toBe(false); // within the app
    expect(crossesPolicyBoundary(true, "/")).toBe(false); // strict to the landing page keeps the strict policy
    expect(crossesPolicyBoundary(false, "/goodbye")).toBe(false); // relaxed to relaxed
  });
  it("is mounted for every page, from the root layout", () => {
    expect(readFileSync(join(APP, "layout.tsx"), "utf8")).toContain("<PolicyBoundary />");
  });
  it("is not worked around: pages that load under the relaxed policy do not navigate in code to strict pages", () => {
    const publicFiles = ["page.tsx", "goodbye/page.tsx", "not-found.tsx", "error.tsx", "global-error.tsx"]
      .map((f) => join(APP, f))
      .concat(readdirSync(join(process.cwd(), "src/components/landing")).filter((f) => f.endsWith(".tsx")).map((f) => join(process.cwd(), "src/components/landing", f)));
    for (const f of publicFiles.filter((f) => existsSync(f))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/router\.(push|replace)\(/);
    }
  });
});

describe("the proxy that applies it", () => {
  const call = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));

  it("gives each request its own nonce, in the header and in what the page is rendered with", async () => {
    const a = await call("/sign-in");
    const b = await call("/sign-in");
    const nonce = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy") ?? "")?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce(a));
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(a.headers.get("content-security-policy"));
  });

  it("is strict on the app and loose only on the prerendered pages", async () => {
    expect((await call("/dashboard")).headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect((await call("/")).headers.get("content-security-policy")).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("makes nonces that are long and different every time", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newNonce()));
    expect(seen.size).toBe(200);
    expect([...seen][0].length).toBeGreaterThanOrEqual(22);
    expect(cspFor("/sign-in", "X")).toContain("'nonce-X'");
  });

  it("answers /admin as an unknown path while the feature is off, before any page runs", async () => {
    delete process.env.SYSTEM_ADMIN_EMAILS;
    const hidden = await call("/admin/users");
    const unknown = await call("/no-such-page");
    expect(hidden.headers.get("x-middleware-rewrite")).toContain("/__no_such_page__");
    expect(hidden.headers.get("x-middleware-rewrite")).not.toContain("/admin");
    // the same policy an unknown path gets: the relaxed one, with no nonce to give a difference away
    expect(hidden.headers.get("content-security-policy")).toBe(unknown.headers.get("content-security-policy"));
    expect(hidden.headers.get("content-security-policy")).not.toContain("nonce-");
    expect(unknown.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("headers that do not change per request", () => {
  const byKey = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));
  it("stops sniffing, framing, referrers and powerful browser features", () => {
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("no-referrer");
    expect(byKey["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) expect(byKey["Permissions-Policy"]).toContain(feature);
  });
  it("is applied to every path, and the CSP is not duplicated here (the proxy owns it)", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers.map((h) => h.key)).not.toContain("Content-Security-Policy");
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
