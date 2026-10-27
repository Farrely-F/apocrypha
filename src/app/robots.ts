import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Only the landing page and the documentation are for search engines. Everything else is the product
// (accounts, vaults, invites, share links) and stays out. The root layout also
// sets noindex, so a route added later is private until it opts in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/$", "/docs", "/_next/static/", "/brand/", "/icons/", "/opengraph-image", "/twitter-image", "/icon.svg", "/favicon.ico", "/apple-icon.png", "/manifest.webmanifest"],
        disallow: ["/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
