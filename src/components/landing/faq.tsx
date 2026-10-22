"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSignedIn } from "./use-signed-in";

export type Question = { q: string; a: string };

/**
 * The closing chapter. Questions on the right, one open at a time; on the left
 * where to go when these don't cover it, and the one way in. No second pitch.
 */
export function Faq({ questions, repo }: { questions: readonly Question[]; repo: string }) {
  const signedIn = useSignedIn();

  return (
    <section id="faq" aria-labelledby="faq-title" className="relative z-10 scroll-mt-14">
      <div className="mx-auto grid w-full max-w-[96rem] gap-10 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16 lg:py-32">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="faq-title" className="font-display text-4xl text-bone">
            Questions
          </h2>
          <p className="mt-4 max-w-[40ch] text-bone-dim">
            The short answers. The long ones are in the{" "}
            <a
              href={`${repo}/blob/main/docs/crypto.md`}
              className="text-bone underline decoration-hairline underline-offset-4 transition-colors hover:decoration-signal"
            >
              crypto spec
            </a>
            , and anything missing is worth an{" "}
            <a
              href={`${repo}/issues`}
              className="text-bone underline decoration-hairline underline-offset-4 transition-colors hover:decoration-signal"
            >
              issue
            </a>
            .
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={signedIn ? "/dashboard" : "/sign-in"} className={buttonVariants({ size: "lg" })}>
              {signedIn ? "Open your dashboard" : "Make a vault"}
            </Link>
            <a href={repo} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Read the source
            </a>
          </div>
        </div>

        <Accordion
          defaultValue={[questions[0].q]}
          className="border-y border-hairline"
        >
          {questions.map((item) => (
            <AccordionItem
              key={item.q}
              value={item.q}
              className="border-b border-hairline-faint last:border-b-0"
            >
              <AccordionTrigger className="items-center gap-6 rounded-none border-0 py-5 text-base font-normal text-bone hover:text-signal hover:no-underline focus-visible:ring-signal/50 **:data-[slot=accordion-trigger-icon]:text-bone-faint hover:**:data-[slot=accordion-trigger-icon]:text-signal aria-expanded:**:data-[slot=accordion-trigger-icon]:text-signal">
                <span>{item.q}</span>
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-base">
                <p className="max-w-[62ch] text-bone-dim">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
