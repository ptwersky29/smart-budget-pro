import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "penni-accent-button shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 rounded-md",
        outline:
          "penni-outline-button shadow-sm hover:bg-secondary",
        secondary:
          "penni-secondary-button hover:brightness-95",
        ghost: "penni-ghost-button",
        link: "text-primary underline-offset-4 hover:underline",
        /* ─── App Design System Variants ─── */
        primary:
          "penni-accent-button active:scale-[0.97]",
        warning:
          "rounded-2xl gradient-topaz text-white shadow-sm active:scale-[0.97]",
        danger:
          "rounded-2xl border border-ruby/30 bg-ruby/10 text-ruby hover:bg-ruby/15 active:scale-[0.97]",
        outlinePill:
          "penni-outline-button active:scale-[0.97]",
        chip:
          "penni-secondary-button px-3 py-1.5 text-xs font-medium active:scale-[0.97]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
        pill: "h-11 px-5",
        pillSm: "h-10 px-4",
        chip: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
