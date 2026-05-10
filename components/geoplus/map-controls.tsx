"use client";

import {
  BookMarked,
  Box,
  Compass,
  FilterX,
  Globe,
  LocateFixed,
  Map,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import type { AppSettings, ControlPosition, StandardControlItem } from "@/components/geoplus/use-app-settings";
import type { DrawMeasurements, DrawMode, DrawTemplate } from "./use-geoplus-map";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MeasurementPanel } from "./measurement-panel";
import { DrawToolbar } from "./draw-toolbar";
import { FeaturePropertiesPanel } from "./feature-properties-panel";
import { CONTROL_BUTTON_CLASS, CONTROL_GROUP_BUTTON_CLASS, CONTROL_GROUP_CLASS } from "./control-button-styles";

const CONTROL_ORDER: StandardControlItem[] = [
  "search",
  "zoom",
  "compass",
  "view3d",
  "projection",
  "legend",
  "locate",
  "fullscreen",
];

const POSITION_CLASSES: Record<ControlPosition, string> = {
  "top-left": "left-3 top-3",
  "top-right": "right-3 top-3",
  "bottom-left": "left-3 bottom-8",
  "bottom-right": "right-3 bottom-8",
};

type MapControlsProps = {
  isSearchPanelOpen: boolean;
  isLegendPanelOpen: boolean;
  mapViewMode: "2d" | "3d";
  mapProjectionMode: "flat" | "globe";
  isLocating: boolean;
  isFullscreen: boolean;
  mapBearing: number;
  activeDrawMode?: DrawMode;
  drawPurpose?: "draw" | "measure";
  selectedDrawFeature?: GeoJSON.Feature | null;
  drawMeasurements?: DrawMeasurements;
  activeDrawTemplate: DrawTemplate | null;
  setActiveDrawTemplate: (template: DrawTemplate | null) => void;
  setMediaViewerData: (data: any) => void;
  onToggleSearchPanel?: () => void;
  onToggleLegendPanel: () => void;
  onSetMapMode: (mode: "2d" | "3d") => void;
  onToggleProjectionMode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNavigation: () => void;
  onGoToCurrentLocation: () => void;
  onToggleFullscreen: () => void;
  onClearFilters?: () => void;
  onSetDrawMode?: (mode: DrawMode, purpose?: "draw" | "measure") => void;
  onDeleteSelectedDraw?: () => void;
  onClearAllDrawings?: () => void;
  onUpdateDrawFeatureProperty?: (featureId: string, key: string, value: unknown) => void;
  onSaveDrawingsAsLayer?: (name: string) => void;
  onSimplifySelectedDraw?: () => void;
  onSmoothSelectedDraw?: () => void;
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
  activeDrawMode = "static",
  drawPurpose = "draw",
  selectedDrawFeature,
  drawMeasurements,
  activeDrawTemplate,
  setActiveDrawTemplate,
  setMediaViewerData,
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
  onSetDrawMode,
  onDeleteSelectedDraw,
  onClearAllDrawings,
  onUpdateDrawFeatureProperty,
  onSaveDrawingsAsLayer,
  onSimplifySelectedDraw,
  onSmoothSelectedDraw,
  settings,
}: MapControlsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState("Draw Layer");
  const [lengthUnit, setLengthUnit] = useState<"km" | "m" | "mi" | "ft">("km");
  const [areaUnit, setAreaUnit] = useState<"sqm" | "sqkm" | "acres" | "hectares" | "sqmi">("sqkm");

  const mapControlPos: ControlPosition = settings?.mapControlPosition ?? "top-right";
  const mapControlOri = settings?.mapControlOrientation ?? "vertical";
  const standardControlLayout = settings?.standardControlLayout ?? "default";
  const drawControlPos: ControlPosition = settings?.drawControlPosition ?? "top-left";
  const drawControlOri = settings?.drawControlOrientation ?? "vertical";
  const isMapLeft = mapControlPos.includes("left");
  const isDrawLeft = drawControlPos.includes("left");
  const drawPanelTop = drawControlPos.includes("bottom") ? "top-16" : "bottom-24";

  const showLengthMeasurement = drawMeasurements?.lengthKm !== undefined && drawMeasurements?.areaSqM === undefined;
  const showAreaMeasurement = drawMeasurements?.areaSqM !== undefined;
  const isMeasureInfoVisible = showLengthMeasurement || showAreaMeasurement;
  const isMeasurementFeatureSelected = Boolean(selectedDrawFeature?.properties?.isMeasurement);
  const shouldShowMeasurementPanel = isMeasureInfoVisible && (drawPurpose === "measure" || isMeasurementFeatureSelected);

  const isControlEnabled = (item: StandardControlItem) => {
    if (item === "search") return settings?.showSearchControl !== false;
    if (item === "zoom") return settings?.showZoomControl !== false;
    if (item === "compass") return settings?.showCompass !== false;
    if (item === "fullscreen") return settings?.showFullscreenControl !== false;
    return true;
  };

  const configuredStandardItems = (settings?.standardControlItems ?? CONTROL_ORDER).filter((item) =>
    CONTROL_ORDER.includes(item),
  );
  const assignedItems = new Set<StandardControlItem>();

  const standardItems = configuredStandardItems.filter((item) => {
    const include = isControlEnabled(item);
    if (include) assignedItems.add(item);
    return include;
  });

  const customGroups =
    settings?.customControlGroups
      ?.map((group) => {
        const seen = new Set<StandardControlItem>();
        const groupOrder = group.items.filter((item) => {
          if (!CONTROL_ORDER.includes(item) || seen.has(item)) {
            return false;
          }
          seen.add(item);
          return true;
        });
        const groupItems = groupOrder.filter((item) => {
          const include = !assignedItems.has(item) && isControlEnabled(item);
          if (include) assignedItems.add(item);
          return include;
        });
        return { ...group, items: groupItems };
      })
      .filter((group) => group.items.length > 0) ?? [];

  const splitItems = CONTROL_ORDER.filter((item) => !assignedItems.has(item) && isControlEnabled(item));
  const standardCompactSegmentCount = standardItems.reduce((count, item) => count + (item === "zoom" ? 2 : 1), 0);
  const standardCompactVerticalHeight =
    standardCompactSegmentCount > 0 ? standardCompactSegmentCount * 36 + (standardCompactSegmentCount - 1) + 2 : 0;
  const splitTopOffset =
    mapControlPos === "top-right"
      ? mapControlOri === "vertical"
        ? standardControlLayout === "compact"
          ? 12 + standardCompactVerticalHeight + 8
          : 12 + standardItems.length * 44
        : 56
      : 12;
  const locateIcon = isLocating ? (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span className="absolute inline-flex h-full w-full rounded-full bg-accent/35 animate-ping" />
      <LocateFixed className="relative size-4 text-accent animate-pulse" />
    </span>
  ) : (
    <LocateFixed className="size-4" />
  );

  const renderControl = (
    item: StandardControlItem,
    orientation: "vertical" | "horizontal",
    keyPrefix: string,
    dockPosition: ControlPosition,
  ) => {
    const controlTooltipSide = dockPosition.includes("right")
      ? "right-[calc(100%+0.4rem)]"
      : "left-[calc(100%+0.4rem)]";
    if (item === "search") {
      return (
        <button
          key={`${keyPrefix}-search`}
          type="button"
          id="geoplus-map-search-btn"
          aria-label={isSearchPanelOpen ? "Hide search panel" : "Show search panel"}
          title={isSearchPanelOpen ? "Hide search panel" : "Show search panel"}
          className={CONTROL_BUTTON_CLASS}
          onClick={onToggleSearchPanel}
        >
          <Search className="size-4" />
        </button>
      );
    }
    if (item === "zoom") {
      return (
        <div
          key={`${keyPrefix}-zoom`}
          id="geoplus-map-zoom-controls"
          className={`${CONTROL_GROUP_CLASS} flex ${orientation === "horizontal" ? "flex-row" : "flex-col"}`}
          role="group"
          aria-label="Zoom controls"
        >
          <button type="button" aria-label="Zoom in" title="Zoom in" className={CONTROL_GROUP_BUTTON_CLASS} onClick={onZoomIn}>
            <Plus className="size-4" />
          </button>
          <div className={orientation === "horizontal" ? "h-full w-px min-h-9 bg-border/80" : "h-px w-full min-w-9 bg-border/80"} />
          <button type="button" aria-label="Zoom out" title="Zoom out" className={CONTROL_GROUP_BUTTON_CLASS} onClick={onZoomOut}>
            <Minus className="size-4" />
          </button>
        </div>
      );
    }
    if (item === "compass") {
      return (
        <button
          key={`${keyPrefix}-compass`}
          type="button"
          id="geoplus-map-compass-btn"
          aria-label="Reset navigation"
          title="Reset navigation"
          className={CONTROL_BUTTON_CLASS}
          onClick={onResetNavigation}
        >
          <Compass className="size-4 transition-transform duration-300" style={{ transform: `rotate(${mapBearing * -1}deg)` }} />
        </button>
      );
    }
    if (item === "view3d") {
      return (
        <div key={`${keyPrefix}-3d`} className="group relative">
          <button
            type="button"
            id="geoplus-map-3d-btn"
            aria-label={mapViewMode === "2d" ? "Enable 3D view" : "Disable 3D view"}
            title={mapViewMode === "2d" ? "Enable 3D view" : "Disable 3D view"}
            className={CONTROL_BUTTON_CLASS}
            onClick={() => onSetMapMode(mapViewMode === "2d" ? "3d" : "2d")}
          >
            <Box className="size-4" />
          </button>
          <span
            className={`pointer-events-none absolute ${controlTooltipSide} top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]`}
          >
            {mapViewMode === "2d" ? "Enable 3D" : "Disable 3D"}
          </span>
        </div>
      );
    }
    if (item === "projection") {
      return (
        <div key={`${keyPrefix}-projection`} className="group relative">
          <button
            type="button"
            id="geoplus-map-projection-btn"
            aria-label={mapProjectionMode === "flat" ? "Enable globe view" : "Enable flat view"}
            title={mapProjectionMode === "flat" ? "Enable globe view" : "Enable flat view"}
            className={CONTROL_BUTTON_CLASS}
            onClick={onToggleProjectionMode}
          >
            {mapProjectionMode === "globe" ? <Globe className="size-4" /> : <Map className="size-4" />}
          </button>
          <span
            className={`pointer-events-none absolute ${controlTooltipSide} top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]`}
          >
            {mapProjectionMode === "flat" ? "Enable Globe" : "Enable Flat"}
          </span>
        </div>
      );
    }
    if (item === "legend") {
      return (
        <button
          key={`${keyPrefix}-legend`}
          type="button"
          id="geoplus-map-legend-btn"
          aria-label={isLegendPanelOpen ? "Hide legend panel" : "Show legend panel"}
          title={isLegendPanelOpen ? "Hide legend panel" : "Show legend panel"}
          className={CONTROL_BUTTON_CLASS}
          onClick={onToggleLegendPanel}
        >
          <BookMarked className="size-4" />
        </button>
      );
    }
    if (item === "locate") {
      return (
        <button
          key={`${keyPrefix}-locate`}
          type="button"
          id="geoplus-map-locate-btn"
          aria-label="Locate device position"
          title="Locate device position"
          className={CONTROL_BUTTON_CLASS}
          onClick={onGoToCurrentLocation}
          disabled={isLocating}
        >
          {locateIcon}
        </button>
      );
    }
    return (
      <button
        key={`${keyPrefix}-fullscreen`}
        type="button"
        id="geoplus-map-fullscreen-btn"
        aria-label={isFullscreen ? "Exit fullscreen canvas" : "Enter fullscreen canvas"}
        title={isFullscreen ? "Exit fullscreen canvas" : "Enter fullscreen canvas"}
        className={CONTROL_BUTTON_CLASS}
        onClick={onToggleFullscreen}
      >
        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    );
  };

  const renderCompactControls = (
    items: StandardControlItem[],
    dockPosition: ControlPosition,
    orientation: "vertical" | "horizontal",
    keyPrefix: string,
  ): ReactNode[] => {
    const dividerClass = orientation === "horizontal" ? "h-full w-px min-h-9 bg-border/80" : "h-px w-full min-w-9 bg-border/80";
    const nodes: ReactNode[] = [];
    items.forEach((item, itemIndex) => {
      if (itemIndex > 0) {
        nodes.push(<div key={`${keyPrefix}-compact-divider-${item}-${itemIndex}`} className={dividerClass} />);
      }

      if (item === "zoom") {
        nodes.push(
          <Fragment key={`${keyPrefix}-compact-zoom`}>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              className={CONTROL_GROUP_BUTTON_CLASS}
              onClick={onZoomIn}
            >
              <Plus className="size-4" />
            </button>
            <div className={dividerClass} />
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              className={CONTROL_GROUP_BUTTON_CLASS}
              onClick={onZoomOut}
            >
              <Minus className="size-4" />
            </button>
          </Fragment>,
        );
      } else if (item === "search") {
        nodes.push(
          <button
            key={`${keyPrefix}-compact-search`}
            type="button"
            id="geoplus-map-search-btn"
            aria-label={isSearchPanelOpen ? "Hide spatial search" : "Show spatial search"}
            title={isSearchPanelOpen ? "Hide spatial search" : "Show spatial search"}
            className={CONTROL_GROUP_BUTTON_CLASS}
            onClick={onToggleSearchPanel}
          >
            <Search className="size-4" />
          </button>,
        );
      } else if (item === "compass") {
        nodes.push(
          <button
            key={`${keyPrefix}-compact-compass`}
            type="button"
            id="geoplus-map-compass-btn"
            aria-label="Reset map bearing"
            title="Reset map bearing"
            className={CONTROL_GROUP_BUTTON_CLASS}
            onClick={onResetNavigation}
          >
            <Compass className="size-4 transition-transform duration-300" style={{ transform: `rotate(${mapBearing * -1}deg)` }} />
          </button>,
        );
      } else if (item === "view3d") {
        const controlTooltipSide = dockPosition.includes("right")
          ? "right-[calc(100%+0.4rem)]"
          : "left-[calc(100%+0.4rem)]";
        nodes.push(
          <div key={`${keyPrefix}-compact-3d`} className="group relative">
            <button
              type="button"
              id="geoplus-map-3d-btn"
              aria-label={mapViewMode === "2d" ? "Enable 3D perspective" : "Disable 3D perspective"}
              title={mapViewMode === "2d" ? "Enable 3D perspective" : "Disable 3D perspective"}
              className={CONTROL_GROUP_BUTTON_CLASS}
              onClick={() => onSetMapMode(mapViewMode === "2d" ? "3d" : "2d")}
            >
              <Box className="size-4" />
            </button>
            <span
              className={`pointer-events-none absolute ${controlTooltipSide} top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]`}
            >
              {mapViewMode === "2d" ? "Enable 3D" : "Disable 3D"}
            </span>
          </div>,
        );
      } else if (item === "projection") {
        const controlTooltipSide = dockPosition.includes("right")
          ? "right-[calc(100%+0.4rem)]"
          : "left-[calc(100%+0.4rem)]";
        nodes.push(
          <div key={`${keyPrefix}-compact-projection`} className="group relative">
            <button
              type="button"
              id="geoplus-map-projection-btn"
              aria-label={mapProjectionMode === "flat" ? "Enable globe projection" : "Enable flat projection"}
              title={mapProjectionMode === "flat" ? "Enable globe projection" : "Enable flat projection"}
              className={CONTROL_GROUP_BUTTON_CLASS}
              onClick={onToggleProjectionMode}
            >
              {mapProjectionMode === "globe" ? <Globe className="size-4" /> : <Map className="size-4" />}
            </button>
            <span
              className={`pointer-events-none absolute ${controlTooltipSide} top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/70 bg-card/92 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition-opacity duration-150 group-hover:opacity-100 dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]`}
            >
              {mapProjectionMode === "flat" ? "Globe view" : "Flat view"}
            </span>
          </div>,
        );
      } else if (item === "legend") {
        nodes.push(
          <button
            key={`${keyPrefix}-compact-legend`}
            type="button"
            id="geoplus-map-legend-btn"
            aria-label={isLegendPanelOpen ? "Hide legend panel" : "Show legend panel"}
            title={isLegendPanelOpen ? "Hide legend panel" : "Show legend panel"}
            className={CONTROL_GROUP_BUTTON_CLASS}
            onClick={onToggleLegendPanel}
          >
            <BookMarked className="size-4" />
          </button>,
        );
      } else if (item === "locate") {
        nodes.push(
          <button
            key={`${keyPrefix}-compact-locate`}
            type="button"
            id="geoplus-map-locate-btn"
            aria-label="Locate device position"
            title="Locate device position"
            className={CONTROL_GROUP_BUTTON_CLASS}
            onClick={onGoToCurrentLocation}
            disabled={isLocating}
          >
            {locateIcon}
          </button>,
        );
      } else if (item === "fullscreen") {
        nodes.push(
          <button
            key={`${keyPrefix}-compact-fullscreen`}
            type="button"
            id="geoplus-map-fullscreen-btn"
            aria-label={isFullscreen ? "Exit fullscreen canvas" : "Enter fullscreen canvas"}
            title={isFullscreen ? "Exit fullscreen canvas" : "Enter fullscreen canvas"}
            className={CONTROL_GROUP_BUTTON_CLASS}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>,
        );
      } else {
        nodes.push(renderControl(item, orientation, "standard-compact", dockPosition));
      }
    });
    return nodes;
  };

  return (
    <>
      {onClearFilters && (
        <div
          className={`pointer-events-auto absolute ${isMapLeft ? "left-16" : "right-16"} top-3 z-30`}
          style={isMapLeft ? { marginLeft: "var(--geoplus-left-safe-area, 0)" } : undefined}
        >
          <button
            type="button"
            id="geoplus-map-clear-filters-btn"
            aria-label="Clear all layer filters"
            title="Clear all layer filters"
            className={CONTROL_BUTTON_CLASS}
            onClick={onClearFilters}
          >
            <FilterX className="size-4" />
          </button>
        </div>
      )}

      {standardItems.length > 0 && (
        <div
          id="geoplus-map-controls"
          className={`pointer-events-auto absolute z-30 flex ${standardControlLayout === "compact" ? "" : "gap-2"} ${POSITION_CLASSES[mapControlPos]} ${mapControlOri === "horizontal" ? "flex-row" : "flex-col"}`}
          style={isMapLeft ? { marginLeft: "var(--geoplus-left-safe-area, 0)" } : undefined}
        >
          {standardControlLayout === "compact" ? (
            <div className={`${CONTROL_GROUP_CLASS} flex ${mapControlOri === "horizontal" ? "flex-row" : "flex-col"}`}>
              {renderCompactControls(standardItems, mapControlPos, mapControlOri, "standard")}
            </div>
          ) : (
            standardItems.map((item) => renderControl(item, mapControlOri, "standard", mapControlPos))
          )}
        </div>
      )}

      {customGroups.map((group) => {
        const isGroupLeft = group.position.includes("left");
        const groupLayout = group.layout ?? "split";
        return (
          <div
            key={group.id}
            id={`geoplus-map-custom-group-${group.id}`}
            className={`pointer-events-auto absolute z-30 flex ${groupLayout === "compact" ? "" : "gap-2"} ${POSITION_CLASSES[group.position]} ${group.orientation === "horizontal" ? "flex-row" : "flex-col"}`}
            style={isGroupLeft ? { marginLeft: "var(--geoplus-left-safe-area, 0)" } : undefined}
          >
            {groupLayout === "compact" ? (
              <div className={`${CONTROL_GROUP_CLASS} flex ${group.orientation === "horizontal" ? "flex-row" : "flex-col"}`}>
                {renderCompactControls(group.items, group.position, group.orientation, group.id)}
              </div>
            ) : (
              group.items.map((item) => renderControl(item, group.orientation, group.id, group.position))
            )}
          </div>
        );
      })}

      {splitItems.length > 0 && (
        <div
          id="geoplus-map-split-controls"
          className="pointer-events-auto absolute right-3 z-30 flex flex-col gap-2"
          style={{ top: `${splitTopOffset}px` }}
        >
          {splitItems.map((item) => renderControl(item, "vertical", "split", "top-right"))}
        </div>
      )}

      <DrawToolbar
        drawControlPos={drawControlPos}
        drawControlOri={drawControlOri}
        isDrawLeft={isDrawLeft}
        activeDrawMode={activeDrawMode}
        drawPurpose={drawPurpose}
        selectedDrawFeature={selectedDrawFeature}
        activeDrawTemplate={activeDrawTemplate}
        setActiveDrawTemplate={setActiveDrawTemplate}
        onSetDrawMode={onSetDrawMode}
        onDeleteSelectedDraw={onDeleteSelectedDraw}
        onClearAllDrawings={onClearAllDrawings}
        onSaveDrawingsAsLayer={onSaveDrawingsAsLayer}
        onSimplifySelectedDraw={onSimplifySelectedDraw}
        onSmoothSelectedDraw={onSmoothSelectedDraw}
        setIsSaving={setIsSaving}
      />

      {shouldShowMeasurementPanel && drawMeasurements && (
        <MeasurementPanel
          key={`measurement-${selectedDrawFeature?.id ?? "none"}-${drawPurpose}`}
          drawMeasurements={drawMeasurements}
          lengthUnit={lengthUnit}
          setLengthUnit={setLengthUnit}
          areaUnit={areaUnit}
          setAreaUnit={setAreaUnit}
          showLength={showLengthMeasurement}
          showArea={showAreaMeasurement}
        />
      )}

      {selectedDrawFeature && drawPurpose !== "measure" && (
        <FeaturePropertiesPanel
          selectedDrawFeature={selectedDrawFeature}
          drawPanelTop={drawPanelTop}
          isDrawLeft={isDrawLeft}
          activeDrawTemplate={activeDrawTemplate}
          onUpdateDrawFeatureProperty={onUpdateDrawFeatureProperty}
          onViewMedia={(data) => setMediaViewerData(data)}
        />
      )}

      {isSaving && (
        <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="w-80 rounded-lg border border-border bg-card p-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="mb-4 text-sm font-bold">Save Drawing as Layer</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Layer Name</label>
                <Input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Enter layer name..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsSaving(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onSaveDrawingsAsLayer?.(saveName);
                    setIsSaving(false);
                  }}
                >
                  Save Layer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
