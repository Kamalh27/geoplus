"use client";

import { Plus } from "lucide-react";
import { Check } from "lucide-react";

import { type GeoPlusBasemapId, GEOPLUS_BASEMAP_OPTIONS } from "@/components/geoplus/map-style";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BasemapStylePanelProps = {
  selectedBasemapId: GeoPlusBasemapId;
  onSelectBasemap: (id: GeoPlusBasemapId) => void;
};

export function BasemapStylePanel({ selectedBasemapId, onSelectBasemap }: BasemapStylePanelProps) {
  return (
    <div className="space-y-6 px-5 py-5">
      <div className="flex items-center justify-between gap-5 py-1.5">
        <h2 className="brand-serif text-[1.28rem] leading-none tracking-[-0.015em] text-foreground">Basemap</h2>
        <Button size="sm" className="h-9 rounded-sm bg-accent px-3.5 text-[0.82rem] font-semibold text-accent-foreground shadow-[0_8px_18px_rgba(20,212,159,0.2)] hover:bg-accent/85">
          <Plus className="mr-1 size-3.5" />
          Add Map Style
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Map Style</p>

        <div className="geoplus-panel-scroll max-h-[54dvh] space-y-3 overflow-y-auto pr-4">
          {GEOPLUS_BASEMAP_OPTIONS.map((basemap) => {
            const isSelected = basemap.id === selectedBasemapId;

            return (
              <button
                key={basemap.id}
                type="button"
                onClick={() => onSelectBasemap(basemap.id)}
                className={cn(
                  "group flex w-full items-center gap-4 rounded-md border px-3.5 py-3 text-left transition-all duration-150",
                  isSelected
                    ? "border-accent/70 bg-accent/12 text-foreground shadow-[inset_0_0_0_1px_rgba(20,212,159,0.18),0_6px_20px_rgba(20,212,159,0.11)]"
                    : "border-border/50 bg-card/35 text-muted-foreground hover:border-accent/40 hover:bg-accent/8 hover:text-foreground",
                )}
              >
                <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-[6px] border border-border/80 shadow-[0_3px_10px_rgba(15,23,42,0.2)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.45)]">
                  <span
                    className="absolute inset-0 block bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                    style={{ backgroundImage: `url("${basemap.previewImage}")` }}
                    aria-hidden="true"
                  />
                  <span className="absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-black/16 dark:from-white/8 dark:to-black/34" aria-hidden="true" />
                </div>

                <span className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold leading-snug tracking-[0.01em]">{basemap.label}</span>

                <span
                  className={cn(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isSelected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border/70 bg-background/60 text-transparent group-hover:border-accent/50 group-hover:text-accent/50",
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
