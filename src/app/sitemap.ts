import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// The landing page is the only public page.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE.url}/`, changeFrequency: "monthly", priority: 1 }];
}
