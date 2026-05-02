"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SquareSwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "role" | "aria-checked"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const SquareSwitch = React.forwardRef<HTMLButtonElement, SquareSwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        ref={ref}
        className={cn(
          "peer inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-none border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          checked 
            ? "border-accent bg-accent text-slate-950" 
            : "border-muted-foreground/40 bg-transparent hover:border-muted-foreground/60",
          className
        )}
        {...props}
      >
        {checked && <Check className="size-3.5 stroke-[3.5]" />}
      </button>
    );
  }
);

SquareSwitch.displayName = "SquareSwitch";
