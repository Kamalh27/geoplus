"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEME_KEY = "spadace-theme";

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const shouldUseDark = stored ? stored === "dark" : true;
    setIsDark(shouldUseDark);
    applyTheme(shouldUseDark);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      applyTheme(next);
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      return next;
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "size-9 rounded-xl border border-border/80 bg-background/85 !text-foreground shadow-sm backdrop-blur-sm hover:!bg-accent hover:!text-foreground [&_svg]:!text-foreground hover:[&_svg]:!text-foreground",
        className,
      )}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="size-4 stroke-[2.2]" /> : <Moon className="size-4 stroke-[2.2]" />}
    </Button>
  );
}
