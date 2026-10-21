import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type DividerProps = Omit<ComponentProps<"div">, "children"> & {
  /** Optional inline label, set into the rule like `──── label ────`. */
  label?: string;
  /** `single` is a 1px hairline, `double` approximates `═`. */
  weight?: "single" | "double";
  orientation?: "horizontal" | "vertical";
  /** Draw `├` / `┤` terminals at the ends of a labelled rule. */
  ends?: boolean;
};

const lineH = {
  single: "border-t border-hairline",
  double: "border-t-[3px] border-double border-hairline",
} as const;

const lineV = {
  single: "border-l border-hairline",
  double: "border-l-[3px] border-double border-hairline",
} as const;

/** Hairline divider. Box-drawing flavoured, no fills, no shadow. */
export function Divider({
  label,
  weight = "single",
  orientation = "horizontal",
  ends = false,
  className,
  ...props
}: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("self-stretch", lineV[weight], className)}
        {...props}
      />
    );
  }

  if (!label) {
    return (
      <div
        role="separator"
        className={cn("w-full", lineH[weight], className)}
        {...props}
      />
    );
  }

  return (
    <div
      role="separator"
      aria-label={label}
      className={cn(
        "flex w-full items-center gap-2 text-xs text-bone-faint",
        className,
      )}
      {...props}
    >
      {ends && (
        <span aria-hidden className="-mr-1 text-hairline">
          ├
        </span>
      )}
      <span aria-hidden className={cn("w-4 shrink-0", lineH[weight])} />
      <span className="uppercase tracking-[0.14em]">{label}</span>
      <span aria-hidden className={cn("min-w-4 flex-1", lineH[weight])} />
      {ends && (
        <span aria-hidden className="-ml-1 text-hairline">
          ┤
        </span>
      )}
    </div>
  );
}
