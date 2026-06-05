import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90 rounded-md",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 rounded-md",
        outline:
          "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 rounded-md",
        ghost: "hover:bg-accent hover:text-accent-foreground rounded-md",
        link: "text-primary underline-offset-4 hover:underline",
        /* ─── App Design System Variants ─── */
        primary:
          "rounded-full gradient-emerald text-white shadow-lg shadow-emerald/15 active:scale-[0.97]",
        warning:
          "rounded-full gradient-topaz text-white active:scale-[0.97]",
        danger:
          "rounded-full border border-ruby text-ruby hover:bg-ruby/5 active:scale-[0.97]",
        outlinePill:
          "rounded-full border border-border bg-card/80 hover:bg-secondary/60 text-muted-foreground hover:text-foreground active:scale-[0.97]",
        chip:
          "rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground active:scale-[0.96]",
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
