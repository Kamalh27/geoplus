"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";

import { useAppSettings } from "@/components/geoplus/use-app-settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { updateSettings, isLoaded } = useAppSettings();
  const [isDark, setIsDark] = React.useState(() => {
    if (typeof document === "undefined") {
      return true;
    }
    return document.documentElement.classList.contains("dark");
  });

  React.useEffect(() => {
    if (!isLoaded) {
      return;
    }
    const root = document.documentElement;
    const syncWithRootClass = () => setIsDark(root.classList.contains("dark"));
    syncWithRootClass();

    const observer = new MutationObserver(syncWithRootClass);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
    };
  }, [isLoaded]);

  const toggleTheme = () => {
    updateSettings({ theme: isDark ? "light" : "dark" });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      disabled={!isLoaded}
      className={cn(
        "rounded-md !text-foreground hover:!bg-accent hover:!text-foreground [&_svg]:!text-foreground hover:[&_svg]:!text-foreground",
        !isLoaded ? "cursor-wait opacity-70" : null,
        className,
      )}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="size-4 stroke-[2.2]" /> : <Moon className="size-4 stroke-[2.2]" />}
    </Button>
  );
}
