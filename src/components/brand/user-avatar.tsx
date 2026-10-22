"use client";

import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";
import { cn } from "@/lib/utils";

/**
 * The face of a signed-in person: a blobatar drawn here from their email, so the
 * same address is the same creature on every device. Nothing is fetched (no
 * GitHub or Google image request) and nothing is stored. Square on a raised
 * pane, no border of its own, so it never sits a frame inside a frame. It blinks
 * on hover and holds still for reduced motion.
 */
export function UserAvatar({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-pane-raised", className)}
      style={{ width: size, height: size }}
    >
      <Blobatar name={name} size={Math.round(size * 0.86)} animate="hover" />
    </span>
  );
}
