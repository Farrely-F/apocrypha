import { cn } from "@/lib/utils";

/**
 * The sealed book on its plinth, for empty states: small, above the message,
 * never a page background. Darkened to sit with the rest of the set.
 */
export function EmptyArt({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="A clasped book on a stone plinth under a hanging lantern"
      className={cn(
        "aspect-[2/3] w-28 border border-hairline-faint bg-ink bg-cover bg-center",
        "[background-image:linear-gradient(rgb(0_0_0/0.45),rgb(0_0_0/0.45)),url('/brand/empty-state-book.webp')]",
        className,
      )}
    />
  );
}
