import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full border text-sm font-medium transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(93,214,255,0.5)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[rgba(93,214,255,0.35)] bg-[linear-gradient(135deg,rgba(93,214,255,0.25),rgba(255,255,255,0.08))] text-white shadow-[0_0_30px_rgba(93,214,255,0.18)] hover:-translate-y-0.5 hover:border-[rgba(93,214,255,0.6)] hover:shadow-[0_0_34px_rgba(93,214,255,0.28)]",
        ghost:
          "border-white/10 bg-white/5 text-zinc-100 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10",
        danger:
          "border-red-400/35 bg-red-500/10 text-red-100 hover:bg-red-500/20 hover:border-red-400/60",
      },
      size: {
        sm: "h-10 px-4",
        md: "h-11 px-5",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
