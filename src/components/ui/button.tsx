import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * Mora button: square, 1px hairline, no shadow, no radius. Signal fill is for
 * the single primary action in a view; blood is for destructive only.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent text-sm font-medium whitespace-nowrap transition-colors duration-100 outline-none select-none active:not-aria-[haspopup]:brightness-95 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-signal bg-signal text-signal-ink hover:bg-bone hover:border-bone",
        outline:
          "border-hairline bg-transparent text-foreground hover:border-signal hover:text-signal aria-expanded:border-signal aria-expanded:text-signal",
        secondary:
          "border-hairline-faint bg-pane-raised text-secondary-foreground hover:border-hairline hover:text-signal",
        ghost:
          "text-bone-dim hover:bg-pane-raised hover:text-foreground aria-expanded:bg-pane-raised aria-expanded:text-foreground",
        destructive:
          "border-blood bg-transparent text-blood-bright hover:bg-blood hover:text-bone focus-visible:outline-blood-bright",
        link: "text-signal underline decoration-signal-dim underline-offset-4 hover:decoration-signal",
      },
      size: {
        default:
          "h-8 gap-2 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
