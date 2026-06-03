"use client";

import { Megaphone, Waypoints, BookOpenText, Bug, PanelLeftClose, Save, User, LogOut, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AppSettings } from "@/components/geoplus/use-app-settings";
import type { GeoPlusUser } from "@/components/geoplus/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type GeoPlusHeaderProps = {
  settings: AppSettings;
  onOpenDialog: (dialogId: "announcement" | "guide" | "user-manual" | "bug-fix-form" | "save-dashboard") => void;
  onToggleSidebar: () => void;
  user: GeoPlusUser | null;
  isAuthLoading: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

export function GeoPlusHeader({ 
  settings, 
  onOpenDialog, 
  onToggleSidebar,
  user,
  isAuthLoading,
  onLogin,
  onLogout
}: GeoPlusHeaderProps) {
  const userInitials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase()
    : "??";

  return (
    <header className="px-3 pt-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="brand-serif text-2xl leading-tight tracking-tight text-foreground">
              GeoPlus
              <sup className="ml-1 align-super text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Beta
              </sup>
            </h1>
            
            {!user ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isAuthLoading}
                onClick={onLogin}
                className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-wider border-accent/30 hover:border-accent/50 hover:bg-accent/5 text-accent rounded-md transition-all"
              >
                {isAuthLoading ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <User className="mr-1.5 size-3" />}
                {isAuthLoading ? "Authenticating..." : "Log In"}
              </Button>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="group flex items-center gap-2 rounded-lg border border-border/40 bg-accent/5 py-1 pl-1 pr-1.5 transition-all hover:bg-accent/10 hover:border-accent/30">
                    <div className="flex size-6 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-foreground shadow-sm">
                      {userInitials}
                    </div>
                    <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" sideOffset={8} className="w-56 p-1.5 shadow-xl border-border/60 bg-card/95 backdrop-blur-md">
                   <div className="mb-1.5 px-2 py-2">
                      <p className="text-xs font-bold text-foreground leading-none">{user.name}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground truncate leading-none">{user.email}</p>
                   </div>
                   <div className="h-px bg-border/40 mx-1 mb-1" />
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={onLogout}
                     className="w-full justify-start gap-2 h-8 text-[11px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-md"
                   >
                     <LogOut className="size-3.5" />
                     Sign Out
                   </Button>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div id="geoplus-header-actions" className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
            <div className="mx-0.5 h-4 w-px bg-border/50 hidden sm:block" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-md hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent dark:hover:text-foreground"
              title={user ? "Save Dashboard" : "Sign in to save dashboard"}
              aria-label="Save Dashboard"
              disabled={!user || isAuthLoading}
              onClick={() => onOpenDialog("save-dashboard")}
            >
              <Save className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
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
          {settings.showThemeToggle ? (
            <ThemeToggle className="rounded-md" />
          ) : null}
        </div>
      </div>
    </header>
  );
}
