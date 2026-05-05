"use client";

import { BookMarked, ChevronDown, Eye, Layers3 } from "lucide-react";
import type { GeoPlusLayerItem, GeoPlusMarkerStyle } from "@/components/geoplus/types";
import { getLayerGeometryFamilies, getLayerColorRampColors } from "@/lib/geoplus/layer-helpers";

type MapLegendPanelProps = {
  isOpen: boolean;
  onToggle: () => void;
  layers: GeoPlusLayerItem[];
  onToggleLayerVisibility: (layerId: string) => void;
};

function LegendShape({
  geometryFamily,
  color,
  markerStyle,
}: {
  geometryFamily: string;
  color: string;
  markerStyle?: GeoPlusMarkerStyle;
}) {
  if (geometryFamily === "Polygon") {
    // Professional polygon patch (blob/squiggly)
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" className="shrink-0 mt-0.5" aria-hidden="true">
        <path
          d="M 2 8 C 2 4, 6 2, 10 2 C 16 2, 22 5, 22 8 C 22 13, 18 14, 12 14 C 6 14, 2 12, 2 8 Z"
          fill={color}
          fillOpacity={0.6}
          stroke={color}
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  
  if (geometryFamily === "Line") {
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" className="shrink-0 mt-0.5" aria-hidden="true">
        <path
          d="M 2 12 Q 8 2, 16 8 T 22 4"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Point geometry
  const isRing = markerStyle === "ring";
  return (
    <svg width="24" height="16" viewBox="0 0 24 16" className="shrink-0 mt-0.5" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r={isRing ? "5" : "6"}
        fill={isRing ? "none" : color}
        stroke={color}
        strokeWidth={isRing ? "2.5" : "1"}
      />
    </svg>
  );
}

export function MapLegendPanel({ isOpen, onToggle, layers, onToggleLayerVisibility }: MapLegendPanelProps) {
  if (!isOpen) {
    return null;
  }

  const visibleLayers = layers.filter((l) => l.visible);

  return (
    <aside className="pointer-events-auto absolute bottom-3 right-14 w-[min(20rem,calc(100%-4.5rem))] max-h-[60vh] overflow-y-auto rounded-xl border border-border/75 bg-card/95 shadow-[0_14px_36px_rgba(15,23,42,0.25)] backdrop-blur-md dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/95 backdrop-blur-sm px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-card-foreground">
          <BookMarked className="size-4 text-accent" />
          <span>Map Legend</span>
        </div>
        <button
          type="button"
          aria-label="Hide legend panel"
          title="Hide legend panel"
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border/60 text-muted-foreground transition hover:bg-accent/20 hover:text-foreground"
          onClick={onToggle}
        >
          <ChevronDown className="size-4" />
        </button>
      </header>

      <div className="space-y-3 px-3 py-3">
        {visibleLayers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/70 px-3 py-5 text-center bg-muted/10">
            <Layers3 className="mx-auto size-6 text-muted-foreground/50 mb-2" />
            <p className="text-xs font-medium text-card-foreground">No active layers</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Turn on a layer to see its legend.</p>
          </div>
        ) : (
          visibleLayers.map((layer) => {
            const families = getLayerGeometryFamilies(layer);
            const primaryFamily = families[0] ?? "Point";
            const config = layer.styleConfig;
            
            // Single color fallback
            let baseColor = config?.fillColor ?? "#22c55e";
            if (primaryFamily === "Point") baseColor = config?.pointColor ?? "#06b6d4";
            if (primaryFamily === "Line") baseColor = config?.lineColor ?? "#14b8a6";

            const isClassified = config?.colorByField;
            const rampColors = getLayerColorRampColors(layer);

            return (
              <div key={layer.id} className="rounded-lg border border-border/60 bg-background/50 overflow-hidden">
                <div className="flex items-center justify-between bg-muted/20 px-2.5 py-2 border-b border-border/40">
                  <p className="text-xs font-semibold text-foreground truncate mr-2" title={layer.name}>
                    {layer.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onToggleLayerVisibility(layer.id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition"
                  >
                    <Eye className="size-3.5" />
                  </button>
                </div>
                
                <div className="p-2.5 space-y-2.5">
                  {!isClassified ? (
                    // Single Symbol
                    <div className="flex items-start gap-2">
                      <LegendShape geometryFamily={primaryFamily} color={baseColor} markerStyle={config?.markerStyle} />
                      <span className="text-xs font-medium text-muted-foreground mt-[1px]">Single Symbol</span>
                    </div>
                  ) : (
                    // Classified
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground truncate">
                        {config.colorByField} ({config.classificationMethod?.replace("-", " ")})
                      </p>
                      
                      {config.classificationMethod === "categorical" ? (
                        <div className="flex flex-wrap gap-1.5">
                           <div className="flex w-full items-center">
                             {rampColors.slice(0, 5).map((color, i) => (
                               <div key={i} className="h-3 flex-1 first:rounded-l-sm last:rounded-r-sm" style={{ backgroundColor: color }} />
                             ))}
                           </div>
                           <p className="text-[10px] text-muted-foreground w-full">Unique categories colored by ramp.</p>
                        </div>
                      ) : (
                        // Continuous (Equal Interval / Quantile)
                        <div className="space-y-1.5">
                          {Array.from({ length: config.classificationClasses ?? 5 }).map((_, i) => {
                            const total = config.classificationClasses ?? 5;
                            const colorIndex = Math.floor((i / (total - 1)) * (rampColors.length - 1));
                            const color = rampColors[colorIndex] ?? rampColors[0];
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <LegendShape geometryFamily={primaryFamily} color={color} markerStyle={config?.markerStyle} />
                                <span className="text-[11px] font-medium text-muted-foreground">Class {i + 1}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
