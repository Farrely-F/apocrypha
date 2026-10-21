// Search and share metadata for the one public page. Wording follows the brand
// voice: plain, and no stronger a claim than the trust model in docs/DESIGN.md.

const NAME = "Apocrypha";

export const SITE = {
  name: NAME,
  title: "Apocrypha: an end-to-end encrypted vault for your .env files",
  description:
    "Keep the .env files for every project in one place, share them with your org, and pick them up on any machine. Sealed in your browser. The server stores only ciphertext.",
  /** Public origin. Used for canonical, Open Graph and sitemap URLs. */
  url: (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  repo: "https://github.com/Farrely-F/apocrypha",
  /** The page background, as hex for browser chrome and the web manifest. */
  background: "#040b0b",
  get jsonLd() {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: NAME,
      applicationCategory: "SecurityApplication",
      operatingSystem: "Web",
      description: this.description,
      url: this.url,
      codeRepository: this.repo,
    };
  },
} as const;
