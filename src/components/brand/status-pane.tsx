import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A full-bleed scene for 404 and error pages. The painting is the page, not a
 * framed card on top of another background: it fades into the abyss on the
 * left, where the title and the way out sit.
 */
export function StatusPane({
  code,
  title,
  children,
  actions,
  art = "gate",
  className,
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  art?: "gate" | "book";
  className?: string;
}) {
  const mark = /^\d{3}$/.test(code) ? code : "ERR";

  return (
    <section
      aria-labelledby="status-title"
      className={cn(
        "relative isolate flex min-h-[calc(100svh-5rem)] w-full overflow-hidden",
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 bg-abyss">
        <div
          className={cn(
            "absolute inset-0",
            art === "gate"
              ? "bg-[url('/brand/archway-gate.webp')] bg-cover bg-[center_42%] opacity-55 [filter:brightness(0.84)_saturate(0.9)] lg:opacity-100"
              : "bg-[url('/brand/empty-state-book.webp')] bg-cover bg-[center_55%] opacity-55 [filter:brightness(0.82)_saturate(0.85)] lg:opacity-75",
          )}
        />
        <div className="absolute inset-0 [background:linear-gradient(to_right,var(--abyss)_0%,oklch(0.14_0.012_195/0.92)_34%,oklch(0.14_0.012_195/0.58)_68%,oklch(0.14_0.012_195/0.18)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 [background:linear-gradient(to_top,var(--abyss)_4%,transparent_72%)]" />
      </div>

      <p
        aria-hidden
        className="pointer-events-none absolute right-4 bottom-0 hidden select-none font-display text-[clamp(9rem,18vw,19rem)] leading-[0.7] tracking-[-0.06em] text-transparent lg:block"
        style={{
          WebkitTextStroke: "1px color-mix(in oklch, var(--bone) 26%, transparent)",
        }}
      >
        {mark}
      </p>

      <div className="relative z-10 mx-auto flex w-full max-w-[96rem] flex-1 flex-col justify-center px-6 py-14 sm:px-10 lg:py-20">
        <h1
          id="status-title"
          className="font-display text-[clamp(3.4rem,7vw,6.75rem)] leading-[0.82] font-semibold tracking-[-0.02em] text-bone text-balance"
        >
          {title}
        </h1>
        <div className="mt-6 grid max-w-[54ch] gap-2.5 text-[0.95rem] text-bone-dim">{children}</div>
        {actions && <div className="mt-8 flex flex-wrap items-center gap-2.5">{actions}</div>}
        {!/^\d{3}$/.test(code) && (
          <p className="mt-7 text-[0.64rem] uppercase tracking-[0.22em] text-bone-faint">{code}</p>
        )}
      </div>
    </section>
  );
}
