import type { MetadataRoute } from "next";
import { DOCS, docPath } from "@/lib/docs";
import { SITE } from "@/lib/seo";

// The landing page and the documentation are the only public pages.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/`, changeFrequency: "monthly", priority: 1 },
    ...DOCS.map((d) => ({ url: `${SITE.url}${docPath(d.slug)}`, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
