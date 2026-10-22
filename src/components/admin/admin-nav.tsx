"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/access", label: "Access log" },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <div className="flex items-center gap-1 px-2 text-sm" role="navigation" aria-label="System">
      <span className="mr-2 hidden text-[0.66rem] uppercase tracking-[0.2em] text-bone-faint sm:inline">System</span>
      {TABS.map((t) => {
        const on = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("px-2.5 py-1 transition-colors", on ? "bg-pane-raised text-bone" : "text-bone-dim hover:text-bone")}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
