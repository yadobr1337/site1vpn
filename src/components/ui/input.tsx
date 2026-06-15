import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[rgba(93,214,255,0.45)] focus:ring-2 focus:ring-[rgba(93,214,255,0.12)]",
        className,
      )}
      {...props}
    />
  );
}
