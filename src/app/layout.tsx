import type { Metadata } from "next";
import { Geist_Mono, Grenze_Gotisch } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

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

export const metadata: Metadata = {
  title: "Apocrypha",
  description:
    "Zero-knowledge secrets vault. What you store here is sealed before it leaves your browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
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
