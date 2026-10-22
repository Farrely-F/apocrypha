import type { NextConfig } from "next";

// The Content Security Policy is set per request in src/proxy.ts, because it carries a nonce
// (see src/lib/security/csp.ts). These are the headers that do not change per request.
const https = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Only when the server is configured for https: on plain http (localhost) the header does nothing.
  ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A self-contained server (.next/standalone) so the Docker image does not need the whole node_modules.
  output: "standalone",
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  experimental: {
    // Integrity hashes on the script and stylesheet files Next can hash at build time.
    sri: { algorithm: "sha384" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
