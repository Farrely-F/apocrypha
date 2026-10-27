import { DocsHeader } from "@/components/docs/docs-header";
import { DocsNav, DocsPager } from "@/components/docs/docs-nav";
import { DocsGround } from "@/components/docs/docs-ground";

// Prerendered, public and indexable: no credentials or keys are on these pages (see lib/security/csp.ts).
// It sits on the hero landscape from the landing page, fixed in place so the page scrolls over it.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex flex-1 flex-col">
      <DocsGround />
      <DocsHeader />
      <div className="mx-auto grid w-full max-w-[96rem] flex-1 gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 lg:py-12">
        <DocsNav />
        <main className="min-w-0 pb-16">
          {children}
          <DocsPager />
        </main>
      </div>
      <footer className="border-t border-hairline-faint bg-background/60 px-6 py-5 text-xs text-bone-faint backdrop-blur-md sm:px-10">
        <div className="mx-auto w-full max-w-[96rem]">Open source. Not independently audited: don&apos;t store anything you can&apos;t rotate.</div>
      </footer>
    </div>
  );
}
