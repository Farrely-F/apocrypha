import type { Metadata } from "next";
import { SITE } from "./seo";

/** The documentation pages, in reading order. One list drives the nav, previous/next, the sitemap and metadata. */
export const DOCS = [
  { slug: "", title: "Overview", description: "What Apocrypha is, how it is organised, and where to start." },
  { slug: "getting-started", title: "Getting started", description: "Sign in, make your vault, save the recovery key and add your first secret." },
  { slug: "secrets", title: "Working with secrets", description: "Add, edit, restore, import, export and share secrets." },
  { slug: "workspace", title: "Organise your work", description: "Organisations, projects, environments, tags and finding things fast." },
  { slug: "teams", title: "Teams and access", description: "Invite people, set roles and per-environment access, and remove someone safely." },
  { slug: "security", title: "Security and privacy", description: "What the server can and cannot see, how locking works, and the limits." },
  { slug: "troubleshooting", title: "Troubleshooting", description: "Locked out, wrong-looking passphrase, missing environments and other snags." },
  { slug: "self-hosting", title: "Self-hosting", description: "Run Apocrypha yourself with Docker and a database file." },
] as const;

export type DocSlug = (typeof DOCS)[number]["slug"];

export const docPath = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

/** Metadata for a docs page. These are the only pages besides the landing page that search engines may index. */
export function docMeta(slug: DocSlug): Metadata {
  const page = DOCS.find((d) => d.slug === slug)!;
  const title = slug ? page.title : "Documentation";
  return {
    title,
    description: page.description,
    alternates: { canonical: docPath(slug) },
    robots: { index: true, follow: true },
    openGraph: { type: "article", url: docPath(slug), siteName: SITE.name, title: `${title} | ${SITE.name}`, description: page.description },
  };
}
