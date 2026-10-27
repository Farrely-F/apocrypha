"use client";

import Link from "next/link";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { Seal } from "@/components/brand/seal";
import { useSignedIn } from "./use-signed-in";

const link =
  "group/link flex items-center gap-1 text-bone-dim transition-colors hover:text-signal";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={link}>
      {children}
      <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover/link:opacity-100" />
    </a>
  );
}

/**
 * The foot of the page sits on the ink sea at the bottom of the painting. A
 * brand line and one row of links, and nothing else competing with the scene.
 */
export function LandingFooter({ repo }: { repo: string }) {
  const signedIn = useSignedIn();
  return (
    <footer className="relative z-10 bg-gradient-to-b from-transparent via-background/40 to-background/85">
      <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-end justify-between gap-x-12 gap-y-8 px-6 pt-28 pb-14 sm:px-10">
        <div className="grid gap-4">
          <div className="flex items-center gap-3 text-bone">
            <Seal title="" aria-hidden className="size-8 text-signal" />
            <span className="font-display text-[1.75rem] leading-none font-semibold">Apocrypha</span>
          </div>
          <p className="max-w-[36ch] text-bone-dim">
            Your .env files, sealed in your browser before they leave it.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link href="/docs" className={link}>Docs</Link>
          <Ext href={repo}>Source</Ext>
          <Ext href={`${repo}/blob/main/docs/crypto.md`}>Crypto spec</Ext>
          <Ext href={`${repo}/blob/main/docs/SELF-HOSTING.md`}>Self-hosting</Ext>
          <Ext href={`${repo}/issues`}>Issues</Ext>
          <Link href={signedIn ? "/dashboard" : "/sign-in"} className={link}>{signedIn ? "Dashboard" : "Sign in"}</Link>
        </nav>
      </div>

      <div className="relative border-t border-hairline-faint bg-background/80">
        <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-bone-faint sm:px-10">
          <span>Open source. Unaudited.</span>
          <a href="#" className="group/top flex items-center gap-1.5 transition-colors hover:text-signal">
            Back to top
            <ArrowUp className="size-3 transition-transform group-hover/top:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
