import type { ComponentProps } from "react";

/**
 * The Apocrypha seal: a watching eye in an almond, four curls at the corners.
 * Stroke only, so it takes the text color around it. Landing, unlock gate and
 * empty states; never in list rows or buttons.
 */
export function Seal({ title = "Apocrypha seal", ...props }: ComponentProps<"svg"> & { title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      role="img"
      aria-label={title}
      {...props}
    >
      <path d="M5 32C14 18 23 13 32 13s18 5 27 19c-9 14-18 19-27 19S14 46 5 32Z" />
      <circle cx="32" cy="32" r="9" />
      <ellipse cx="32" cy="32" rx="2.2" ry="6.5" fill="currentColor" stroke="none" />
      <path d="M10 10c5 0 8 3 8 7" />
      <path d="M54 10c-5 0-8 3-8 7" />
      <path d="M10 54c5 0 8-3 8-7" />
      <path d="M54 54c-5 0-8-3-8-7" />
    </svg>
  );
}
