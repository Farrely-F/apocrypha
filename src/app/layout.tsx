import type { Metadata, Viewport } from "next";
import { Geist_Mono, Grenze_Gotisch } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/seo";

// Working face: everything is mono.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face: Grenze Gotisch, a blackletter-cut gothic. Wordmark and
// section titles only.
const display = Grenze_Gotisch({
  variable: "--font-display-face",
  subsets: ["latin"],
});

// Private by default: this is an account-based app, so only a page that opts in
// (the landing page) is indexable. Pages set their own title through the template.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: { default: SITE.name, template: `%s | ${SITE.name}` },
  description: SITE.description,
  robots: { index: false, follow: false },
  authors: [{ name: SITE.name, url: SITE.repo }],
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: SITE.background,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn(
        "h-full antialiased font-sans",
        geistMono.variable,
        display.variable,
      )}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
