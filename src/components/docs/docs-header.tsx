"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Seal } from "@/components/brand/seal";
import { buttonVariants } from "@/components/ui/button";
import { useSignedIn } from "@/components/landing/use-signed-in";
import { SITE } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Slim top bar for the docs: back to the product, the source, and the way in. */
export function DocsHeader() {
  const signedIn = useSignedIn();
  return (
    <header className="sticky top-0 z-30 border-b border-hairline-faint bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[96rem] items-center gap-4 px-6 sm:px-10">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 text-bone">
          <Seal title="" aria-hidden className="size-6 text-signal-dim transition-colors group-hover:text-signal" />
          <span className="font-display text-[1.45rem] leading-none font-semibold transition-colors group-hover:text-signal">Apocrypha</span>
        </Link>
        <span aria-hidden className="text-bone-faint">/</span>
        <Link href="/docs" className="text-sm text-bone-dim transition-colors hover:text-bone">
          Docs
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <a href={SITE.repo} className="hidden items-center gap-1 px-3 py-1.5 text-sm text-bone-dim transition-colors hover:text-bone sm:flex">
            Source <ArrowUpRight aria-hidden className="size-3" />
          </a>
          <Link href={signedIn ? "/dashboard" : "/sign-in"} className={cn(buttonVariants({ size: "sm" }), "rounded-full px-4")}>
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}
