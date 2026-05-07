"use client";

import { BookMarked, Box, Compass, Globe, Loader2, LocateFixed, Map, Maximize2, Minimize2, Minus, Plus, Search, FilterX } from "lucide-react";
import type { AppSettings } from "@/components/geoplus/use-app-settings";

const CONTROL_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border/75 bg-card/92 text-card-foreground shadow-[0_10px_25px_rgba(15,23,42,0.2)] backdrop-blur transition hover:bg-accent/20 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]";
const CONTROL_GROUP_CLASS =
  "overflow-hidden rounded-sm border border-border/75 bg-card/92 text-card-foreground shadow-[0_10px_25px_rgba(15,23,42,0.2)] backdrop-blur dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]";
const CONTROL_GROUP_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center text-card-foreground transition hover:bg-accent/20 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

type MapControlsProps = {
  isSearchPanelOpen: boolean;
  isLegendPanelOpen: boolean;
  mapViewMode: "2d" | "3d";
  mapProjectionMode: "flat" | "globe";
  isLocating: boolean;
  isFullscreen: boolean;
  mapBearing: number;
  onToggleSearchPanel: () => void;
  onToggleLegendPanel: () => void;
  onSetMapMode: (mode: "2d" | "3d") => void;
  onToggleProjectionMode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNavigation: () => void;
  onGoToCurrentLocation: () => void;
  onToggleFullscreen: () => void;
  onClearFilters?: () => void;
  settings?: AppSettings;
};

export function MapControls({
  isSearchPanelOpen,
  isLegendPanelOpen,
  mapViewMode,
  mapProjectionMode,
  isLocating,
  isFullscreen,
  mapBearing,
  onToggleSearchPanel,
  onToggleLegendPanel,
  onSetMapMode,
  onToggleProjectionMode,
  onZoomIn,
  onZoomOut,
  onResetNavigation,
  onGoToCurrentLocation,
  onToggleFullscreen,
  onClearFilters,
  settings,
}: MapControlsProps) {
  return (
    <>
      {onClearFilters && (
        <div className="pointer-events-auto absolute right-16 top-3">
          <button
            type="button"
            id="geoplus-map-clear-filters-btn"
            aria-label="Clear all layer filters"
            title="Clear all layer filters"
            className={CONTROL_BUTTON_CLASS}
            onClick={onClearFilters}
          >
            <FilterX className="size-4 text-rose-400" />
          </button>
        </div>
      )}
      <div id="geoplus-map-controls" className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
        {settings?.showSearchControl !== false && (
          <button
            type="button"
            id="geoplus-map-search-btn"
            aria-label={isSearchPanelOpen ? "Hide search panel" : "Show search panel"}
            title={isSearchPanelOpen ? "Hide search panel" : "Show search panel"}
            className={`${CONTROL_BUTTON_CLASS} ${isSearchPanelOpen ? "bg-accent/20 text-accent" : ""}`}
            onClick={onToggleSearchPanel}
          >
            <Search className="size-4" />
          </button>
        )}

        {settings?.showZoomControl !== false && (
        <div id="geoplus-map-zoom-controls" className={CONTROL_GROUP_CLASS} role="group" aria-label="Zoom controls">
          <button type="button" aria-label="Zoom in" title="Zoom in" className={CONTROL_GROUP_BUTTON_CLASS} onClick={onZoomIn}>
            <Plus className="size-4" />
          </button>
          <div className="h-px w-full bg-border/80" />
          <button type="button" aria-label="Zoom out" title="Zoom out" className={CONTROL_GROUP_BUTTON_CLASS} onClick={onZoomOut}>
            <Minus className="size-4" />
          </button>
        </div>
      )}

      {settings?.showCompass !== false && (
        <button type="button" id="geoplus-map-compass-btn" aria-label="Reset navigation" title="Reset navigation" className={CONTROL_BUTTON_CLASS} onClick={onResetNavigation}>
          <Compass className="size-4 transition-transform duration-300" style={{ transform: `rotate(${mapBearing * -1}deg)` }} />
        </button>
      )}

      <div className="group relative">
        <button
          type="button"
          id="geoplus-map-3d-btn"
          aria-label={mapViewMode === "2d" ? "Enable 3D view" : "Disable 3D view"}
          title={mapViewMode === "2d" ? "Enable 3D view" : "Disable 3D view"}
          className={`${CONTROL_BUTTON_CLASS} ${mapViewMode === "3d" ? "bg-accent/20 text-accent" : ""}`}
          onClick={() => onSetMapMode(mapViewMode === "2d" ? "3d" : "2d")}
        >
          <Box className="size-4" />
        </button>
        <span className="pointer-events-none absolute right-[calc(100%+0.4rem)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
          {mapViewMode === "2d" ? "Enable 3D" : "Disable 3D"}
        </span>
      </div>

      <div className="group relative">
        <button
          type="button"
          id="geoplus-map-projection-btn"
          aria-label={mapProjectionMode === "flat" ? "Enable globe view" : "Enable flat view"}
          title={mapProjectionMode === "flat" ? "Enable globe view" : "Enable flat view"}
          className={`${CONTROL_BUTTON_CLASS} ${mapProjectionMode === "globe" ? "bg-accent/20 text-accent" : ""}`}
          onClick={onToggleProjectionMode}
        >
          {mapProjectionMode === "globe" ? <Globe className="size-4" /> : <Map className="size-4" />}
        </button>
        <span className="pointer-events-none absolute right-[calc(100%+0.4rem)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
          {mapProjectionMode === "flat" ? "Enable Globe" : "Enable Flat"}
        </span>
      </div>

      <button
        type="button"
        id="geoplus-map-legend-btn"
        aria-label={isLegendPanelOpen ? "Hide legend panel" : "Show legend panel"}
        title={isLegendPanelOpen ? "Hide legend panel" : "Show legend panel"}
        className={`${CONTROL_BUTTON_CLASS} ${isLegendPanelOpen ? "bg-accent/20 text-accent" : ""}`}
        onClick={onToggleLegendPanel}
      >
        <BookMarked className="size-4" />
      </button>

      <button
        type="button"
        id="geoplus-map-locate-btn"
        aria-label="Go to current location"
        title="Go to current location"
        className={CONTROL_BUTTON_CLASS}
        onClick={onGoToCurrentLocation}
        disabled={isLocating}
      >
        {isLocating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
      </button>

      {settings?.showFullscreenControl !== false && (
        <button
          type="button"
          id="geoplus-map-fullscreen-btn"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className={CONTROL_BUTTON_CLASS}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      )}
    </div>
    </>
  );
}
