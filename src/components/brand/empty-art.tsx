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
        "aspect-[2/3] w-28 bg-cover bg-center opacity-60 [filter:saturate(0.7)] [mask-image:radial-gradient(ellipse_60%_62%_at_50%_50%,#000_28%,transparent_100%)]",
        "[background-image:linear-gradient(rgb(0_0_0/0.3),rgb(0_0_0/0.3)),url('/brand/empty-state-book.webp')]",
        className,
      )}
    />
  );
}
