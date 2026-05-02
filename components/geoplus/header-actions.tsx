"use client";

import { Megaphone, Waypoints, BookOpenText, Bug, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AppSettings } from "@/components/geoplus/use-app-settings";

type GeoPlusHeaderProps = {
  settings: AppSettings;
  onOpenDialog: (dialogId: "announcement" | "guide" | "user-manual" | "bug-fix-form") => void;
  onToggleSidebar: () => void;
};

export function GeoPlusHeader({ settings, onOpenDialog, onToggleSidebar }: GeoPlusHeaderProps) {
  return (
    <header className="px-3 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="brand-serif text-2xl leading-tight tracking-tight text-foreground">
            GeoPlus
            <sup className="ml-1 align-super text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Beta
            </sup>
          </h1>

          <div id="geoplus-header-actions" className="mt-1.5 flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-md hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent dark:hover:text-foreground"
              title="Announcements and new features"
              aria-label="Announcements and new features"
              onClick={() => onOpenDialog("announcement")}
            >
              <Megaphone className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-md hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent dark:hover:text-foreground"
              title="Guided tour"
              aria-label="Guided tour"
              onClick={() => onOpenDialog("guide")}
            >
              <Waypoints className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-md hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent dark:hover:text-foreground"
              title="User manual and documentation"
              aria-label="User manual and documentation"
              onClick={() => onOpenDialog("user-manual")}
            >
              <BookOpenText className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-md hover:bg-destructive/15 hover:text-destructive dark:hover:bg-destructive/30"
              title="Bug report"
              aria-label="Bug report"
              onClick={() => onOpenDialog("bug-fix-form")}
            >
              <Bug className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {settings.showThemeToggle ? (
            <ThemeToggle className="!hover:bg-accent !hover:text-accent-foreground dark:!hover:bg-accent dark:!hover:text-foreground hover:[&_svg]:!text-accent-foreground dark:hover:[&_svg]:!text-foreground" />
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-md hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent dark:hover:text-foreground"
            title="Hide sidebar"
            aria-label="Hide sidebar"
            onClick={onToggleSidebar}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
