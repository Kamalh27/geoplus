"use client";

import { type DragEvent as ReactDragEvent, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Circle,
  CircleDot,
  Download,
  EllipsisVertical,
  Eye,
  EyeOff,
  Flame,
  Filter,
  Focus,
  GripVertical,
  Image,
  Info,
  Leaf,
  Palette,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Table2,
  Type,
  Waves,
  type LucideIcon,
  X,
} from "lucide-react";

import { LayerStyleDialog } from "@/components/geoplus/layer-style-dialog";
import { AddDataDialog } from "@/components/geoplus/add-data-dialog";
import type { GeoPlusColorRamp, GeoPlusLayerItem, GeoPlusLayerStylePreset, GeoPlusMarkerStyle, GeoPlusMarkerSymbol } from "@/components/geoplus/types";
import { useAppSettings } from "@/components/geoplus/use-app-settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isGeoJsonFeatureCollection } from "@/lib/geoplus/duckdb-spatial-analytics";
import { cn } from "@/lib/utils";
import { getLayerGeometryFamilies } from "@/lib/geoplus/layer-helpers";

type LayerPanelProps = {
  layers: GeoPlusLayerItem[];
  onAddLayer: (layer: GeoPlusLayerItem) => void;
  onToggleLayerVisibility: (layerId: string) => void;
  onSetLayerOpacity: (layerId: string, opacity: number) => void;
  onSetLayerStylePreset: (layerId: string, preset: GeoPlusLayerStylePreset) => void;
  onSetLayerStyleConfig: (
    layerId: string,
    styleConfig: NonNullable<GeoPlusLayerItem["styleConfig"]>,
  ) => void;
  onSetLayerLabelConfig: (layerId: string, config: { enabled?: boolean; field?: string }) => void;
  onSetLayerInteractionConfig: (layerId: string, config: { tooltipEnabled?: boolean; popupEnabled?: boolean }) => void;
  onRenameLayer: (layerId: string, nextName: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onReorderLayer: (draggedLayerId: string, targetLayerId: string, placement: "before" | "after") => void;
  onZoomToLayer: (layerId: string) => void;
  onOpenLayerTable: (layerId: string) => void;
  onOpenLayerChart: (layerId: string) => void;
};

const toolbarButtonClassName =
  "inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-700/60 hover:text-emerald-200";

const stylePresetLineClassName: Record<GeoPlusLayerStylePreset, string> = {
  emerald: "border-emerald-500",
  sky: "border-sky-500",
  amber: "border-amber-500",
  rose: "border-rose-500",
  slate: "border-slate-500",
  violet: "border-violet-500",
  lime: "border-lime-500",
  teal: "border-teal-500",
};

const getLayerLineClassName = (layer: GeoPlusLayerItem) => stylePresetLineClassName[layer.stylePreset] ?? "border-emerald-500";
const stylePresetOptions: Array<{ id: GeoPlusLayerStylePreset; label: string; icon: LucideIcon }> = [
  { id: "emerald", label: "Forest", icon: Leaf },
  { id: "sky", label: "Ocean", icon: Waves },
  { id: "amber", label: "Sunset", icon: SunMedium },
  { id: "rose", label: "Ember", icon: Flame },
  { id: "slate", label: "Graphite", icon: Focus },
  { id: "violet", label: "Aurora", icon: Sparkles },
  { id: "lime", label: "Citrus", icon: CircleDot },
  { id: "teal", label: "Lagoon", icon: Circle },
];

const markerStyleOptions: Array<{ id: GeoPlusMarkerStyle; label: string; icon: LucideIcon }> = [
  { id: "solid", label: "Solid", icon: Circle },
  { id: "ring", label: "Ring", icon: CircleDot },
  { id: "glow", label: "Glow", icon: Sparkles },
  { id: "symbol", label: "Symbol", icon: Type },
  { id: "image", label: "Image", icon: Image },
];

const markerSymbolOptions: Array<{ id: GeoPlusMarkerSymbol; label: string; glyph: string }> = [
  { id: "dot", label: "Dot", glyph: "●" },
  { id: "diamond", label: "Diamond", glyph: "◆" },
  { id: "triangle", label: "Triangle", glyph: "▲" },
  { id: "square", label: "Square", glyph: "■" },
  { id: "star", label: "Star", glyph: "★" },
  { id: "pin", label: "Pin", glyph: "📍" },
];

const colorRampOptions: Array<{ id: GeoPlusColorRamp; label: string }> = [
  { id: "vivid", label: "Vivid" },
  { id: "earth", label: "Earth" },
  { id: "pastel", label: "Pastel" },
  { id: "magma", label: "Magma" },
  { id: "inferno", label: "Inferno" },
  { id: "plasma", label: "Plasma" },
  { id: "viridis", label: "Viridis" },
  { id: "ylgnbu", label: "Yellow-Green-Blue" },
  { id: "orrd", label: "Orange-Red" },
  { id: "coolwarm", label: "Coolwarm (Diverging)" },
  { id: "spring", label: "Spring" },
  { id: "summer", label: "Summer" },
  { id: "autumn", label: "Autumn" },
  { id: "winter", label: "Winter" },
  { id: "jet", label: "Jet" },
  { id: "bone", label: "Bone" },
  { id: "copper", label: "Copper" },
];

const DEFAULT_STYLE_CONFIG = {
  fillOpacity: 0.18,
  lineWidth: 2,
  pointRadius: 5,
  labelSize: 13,
} as const;

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const stylePresetHexColors: Record<GeoPlusLayerStylePreset, { fill: string; line: string; point: string; label: string }> = {
  emerald: { fill: "#22c55e", line: "#14b8a6", point: "#06b6d4", label: "#0f766e" },
  sky: { fill: "#38bdf8", line: "#2563eb", point: "#0ea5e9", label: "#1e40af" },
  amber: { fill: "#fbbf24", line: "#d97706", point: "#f59e0b", label: "#92400e" },
  rose: { fill: "#fb7185", line: "#e11d48", point: "#f43f5e", label: "#9f1239" },
  slate: { fill: "#64748b", line: "#334155", point: "#475569", label: "#0f172a" },
  violet: { fill: "#a78bfa", line: "#7c3aed", point: "#8b5cf6", label: "#5b21b6" },
  lime: { fill: "#84cc16", line: "#65a30d", point: "#a3e635", label: "#3f6212" },
  teal: { fill: "#14b8a6", line: "#0f766e", point: "#2dd4bf", label: "#134e4a" },
};

const toSentenceCase = (value: string) => {
  const cleaned = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  const normalized = cleaned.toLowerCase();
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const getLayerDisplayName = (name: string | undefined) => {
  const sentenceCaseName = toSentenceCase(name ?? "");
  return sentenceCaseName || "Untitled layer";
};

const DATA_FORMAT_LABELS_BY_EXTENSION: Record<string, string> = {
  geojson: "GeoJSON",
  json: "GeoJSON",
  zip: "Shapefile",
  shp: "Shapefile",
  kml: "KML",
  kmz: "KMZ",
  csv: "CSV",
  tsv: "TSV",
  gpkg: "GeoPackage",
  geopackage: "GeoPackage",
  parquet: "GeoParquet",
  geoparquet: "GeoParquet",
  tif: "COG",
  tiff: "COG",
  pmtiles: "PMTiles",
  mbtiles: "MBTiles",
  zarr: "Zarr",
  mvt: "MVT",
  pbf: "MVT",
  png: "Raster Tile",
  jpg: "Raster Tile",
  jpeg: "Raster Tile",
  webp: "Raster Tile",
};

const getExtensionFromFileName = (fileName: string | undefined) => {
  if (!fileName) {
    return "";
  }
  const parts = fileName.split(".");
  if (parts.length < 2) {
    return "";
  }
  return parts.at(-1)?.trim().toLowerCase() ?? "";
};

const getExtensionFromUrl = (urlValue: string | undefined) => {
  if (!urlValue) {
    return "";
  }
  const sanitized = urlValue.split("?")[0] ?? urlValue;
  return getExtensionFromFileName(sanitized);
};

const getLayerDataFormat = (layer: GeoPlusLayerItem) => {
  const fileExtension = getExtensionFromFileName(layer.fileName);
  if (fileExtension && DATA_FORMAT_LABELS_BY_EXTENSION[fileExtension]) {
    return DATA_FORMAT_LABELS_BY_EXTENSION[fileExtension];
  }

  const sourceExtension = getExtensionFromUrl(layer.sourceUrl);
  if (sourceExtension && DATA_FORMAT_LABELS_BY_EXTENSION[sourceExtension]) {
    return DATA_FORMAT_LABELS_BY_EXTENSION[sourceExtension];
  }

  if (layer.sourceMode === "gis-paste") {
    return "GeoJSON / WKT";
  }

  if (layer.serviceType) {
    return layer.serviceType.toUpperCase();
  }

  if (layer.layerType === "geojson" || layer.layerType === "scatterplot") {
    return "GeoJSON";
  }

  return toSentenceCase(layer.layerType);
};



const getLayerDataTypeLabel = (layer: GeoPlusLayerItem) => {
  const isRaster = layer.layerType === "raster-tile" || layer.layerType === "wms";
  if (isRaster) {
    return "Raster";
  }

  const geometryFamilies = getLayerGeometryFamilies(layer);
  if (geometryFamilies.length > 0) {
    return `Vector (${geometryFamilies.join(" / ")})`;
  }

  if (layer.layerType === "geojson" || layer.layerType === "scatterplot" || layer.layerType === "mvt") {
    return "Vector";
  }

  return toSentenceCase(layer.layerType);
};

const getLayerLabelFieldOptions = (layer: GeoPlusLayerItem) => {
  const fields = new Set<string>(layer.duckDbColumns ?? []);
  const candidates = [layer.rawInlineData, layer.inlineData];
  for (const candidate of candidates) {
    if (!isGeoJsonFeatureCollection(candidate)) {
      continue;
    }
    for (const feature of candidate.features.slice(0, 120)) {
      const properties = feature?.properties;
      if (!properties || typeof properties !== "object") {
        continue;
      }
      for (const key of Object.keys(properties)) {
        const trimmed = key.trim();
        if (trimmed) {
          fields.add(trimmed);
        }
      }
    }
  }
  return [...fields].sort((left, right) => left.localeCompare(right));
};

const getLayerStyleFieldOptions = (layer: GeoPlusLayerItem) => getLayerLabelFieldOptions(layer);

export function LayerPanel({
  layers,
  onAddLayer,
  onToggleLayerVisibility,
  onSetLayerOpacity,
  onSetLayerStylePreset,
  onSetLayerStyleConfig,
  onSetLayerLabelConfig,
  onSetLayerInteractionConfig,
  onRenameLayer,
  onRemoveLayer,
  onReorderLayer,
  onZoomToLayer,
  onOpenLayerTable,
  onOpenLayerChart,
}: LayerPanelProps) {
  const { settings } = useAppSettings();
  const [moreMenuLayerId, setMoreMenuLayerId] = useState<string | null>(null);
  const [infoPopoverLayerId, setInfoPopoverLayerId] = useState<string | null>(null);
  const [labelPopoverLayerId, setLabelPopoverLayerId] = useState<string | null>(null);
  const [styleLayerId, setStyleLayerId] = useState<string | null>(null);
  const [renameLayerId, setRenameLayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<"before" | "after" | null>(null);
  const moreMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const moreMenuPopoverRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const infoPopoverTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const infoPopoverRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const labelPopoverTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const labelPopoverRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const renameTargetLayer = layers.find((layer) => layer.id === renameLayerId) ?? null;
  const styleTargetLayer = layers.find((layer) => layer.id === styleLayerId) ?? null;
  const styleTargetDefaults = styleTargetLayer
    ? stylePresetHexColors[styleTargetLayer.stylePreset] ?? stylePresetHexColors.emerald
    : stylePresetHexColors.emerald;
  const layerToolSettings = settings.layerTools;

  const closeRenameDialog = () => {
    setRenameLayerId(null);
    setRenameValue("");
  };

  const handleCustomMarkerUpload = (layerId: string, file: File | null) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        return;
      }
      onSetLayerStyleConfig(layerId, {
        markerStyle: "image",
        customMarkerDataUrl: result,
      });
    };
    reader.readAsDataURL(file);
  };

  const closeStyleDialog = () => {
    setStyleLayerId(null);
  };

  useEffect(() => {
    if (!moreMenuLayerId) {
      return;
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const activeTrigger = moreMenuTriggerRefs.current[moreMenuLayerId];
      const activePopover = moreMenuPopoverRefs.current[moreMenuLayerId];
      if (activeTrigger?.contains(target) || activePopover?.contains(target)) {
        return;
      }

      setMoreMenuLayerId(null);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, [moreMenuLayerId]);

  useEffect(() => {
    if (!infoPopoverLayerId) {
      return;
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const activeTrigger = infoPopoverTriggerRefs.current[infoPopoverLayerId];
      const activePopover = infoPopoverRefs.current[infoPopoverLayerId];
      if (activeTrigger?.contains(target) || activePopover?.contains(target)) {
        return;
      }

      setInfoPopoverLayerId(null);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, [infoPopoverLayerId]);

  useEffect(() => {
    if (!labelPopoverLayerId) {
      return;
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const activeTrigger = labelPopoverTriggerRefs.current[labelPopoverLayerId];
      const activePopover = labelPopoverRefs.current[labelPopoverLayerId];
      if (activeTrigger?.contains(target) || activePopover?.contains(target)) {
        return;
      }

      setLabelPopoverLayerId(null);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, [labelPopoverLayerId]);

  const resetDragState = () => {
    setDraggedLayerId(null);
    setDragOverLayerId(null);
    setDropPlacement(null);
  };

  const onLayerDragStart = (layerId: string) => {
    setDraggedLayerId(layerId);
    setDragOverLayerId(null);
    setDropPlacement(null);
  };

  const onLayerDragOver = (event: ReactDragEvent<HTMLElement>, layerId: string) => {
    if (!draggedLayerId || draggedLayerId === layerId) {
      return;
    }

    event.preventDefault();
    const { top, height } = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < top + height / 2 ? "before" : "after";
    setDragOverLayerId(layerId);
    setDropPlacement(placement);
  };

  const onLayerDrop = (event: ReactDragEvent<HTMLElement>, layerId: string) => {
    event.preventDefault();
    if (!draggedLayerId || draggedLayerId === layerId || !dropPlacement) {
      resetDragState();
      return;
    }

    onReorderLayer(draggedLayerId, layerId, dropPlacement);
    resetDragState();
  };

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between gap-4 px-4">
        <h2 className="text-[1.02rem] font-semibold uppercase tracking-[0.11em] text-foreground">Layers ({layers.length})</h2>
        <AddDataDialog onAddLayer={onAddLayer} existingLayers={layers} />
      </div>

      {layers.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-7 text-center">
          <p className="text-sm font-medium text-foreground">No layers available</p>
          <p className="mt-1 text-xs text-muted-foreground">Click Add Data to upload datasets or connect map services.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {layers.map((layer) => {
            const hasInsightsData = isGeoJsonFeatureCollection(layer.rawInlineData) || isGeoJsonFeatureCollection(layer.inlineData);
            const labelFieldOptions = getLayerLabelFieldOptions(layer);
            const hasLabelFieldOptions = labelFieldOptions.length > 0;
            const isLabelEnabled = Boolean(layer.labelEnabled && layer.labelField);
            const layerDisplayName = getLayerDisplayName(layer.name);
            return (
              <article
                key={layer.id}
                className={cn(
                  "relative rounded-2xl border border-slate-700/65 bg-slate-900/87 p-3.5 text-slate-100 shadow-[0_8px_28px_rgba(15,23,42,0.3)]",
                  dragOverLayerId === layer.id && "border-emerald-400/70 bg-emerald-400/10",
                )}
                onDragOver={layers.length > 1 ? (event) => onLayerDragOver(event, layer.id) : undefined}
                onDrop={layers.length > 1 ? (event) => onLayerDrop(event, layer.id) : undefined}
                onDragEnd={resetDragState}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    return;
                  }
                  if (dragOverLayerId === layer.id) {
                    setDragOverLayerId(null);
                    setDropPlacement(null);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("absolute inset-y-0 left-0 w-1.5 rounded-l-2xl border-l-2", getLayerLineClassName(layer))} />
                  {layers.length > 1 ? (
                    <button
                      type="button"
                      draggable
                      title="Drag to reorder layer"
                      aria-label="Drag to reorder layer"
                      className={cn(toolbarButtonClassName, "cursor-grab active:cursor-grabbing ml-1")}
                      onDragStart={() => onLayerDragStart(layer.id)}
                      onDragEnd={resetDragState}
                    >
                      <GripVertical className="size-4" />
                    </button>
                  ) : <div className="ml-1" />}
                  <p className={cn("min-w-0 flex-1 truncate text-[0.95rem] font-semibold tracking-[-0.01em] text-slate-100", !layer.visible && "text-slate-400 line-through")}>
                    {layerDisplayName}
                  </p>

                  {layerToolSettings.showInfo ? (
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-200 transition hover:bg-slate-700/60 hover:text-emerald-200"
                      ref={(element) => {
                        infoPopoverTriggerRefs.current[layer.id] = element;
                      }}
                      onClick={() => {
                        setInfoPopoverLayerId((current) => (current === layer.id ? null : layer.id));
                        setMoreMenuLayerId(null);
                        setLabelPopoverLayerId(null);
                      }}
                      title="Layer info"
                      aria-label="Layer info"
                    >
                      <Info className="size-4" />
                    </button>
                  ) : null}

                  {layerToolSettings.showRename ? (
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-200 transition hover:bg-slate-700/60 hover:text-emerald-200"
                      onClick={() => {
                        setRenameLayerId(layer.id);
                        setRenameValue(layer.name ?? "");
                      }}
                      title="Rename layer"
                      aria-label="Rename layer"
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-200 transition hover:bg-rose-500/20 hover:text-rose-200"
                    onClick={() => onRemoveLayer(layer.id)}
                    title="Remove layer"
                    aria-label="Remove layer"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="mt-1.5 flex w-full items-center justify-between">
                  <button
                    type="button"
                    className={toolbarButtonClassName}
                    onClick={() => onToggleLayerVisibility(layer.id)}
                    title={layer.visible ? "Hide layer" : "Show layer"}
                    aria-label={layer.visible ? "Hide layer" : "Show layer"}
                  >
                    {layer.visible ? <Eye className="size-4 text-sky-400" /> : <EyeOff className="size-4 text-slate-400" />}
                  </button>

                  {layerToolSettings.showZoom ? (
                    <button
                      type="button"
                      className={toolbarButtonClassName}
                      onClick={() => onZoomToLayer(layer.id)}
                      title="Zoom to layer"
                      aria-label="Zoom to layer"
                    >
                      <Focus className="size-4" />
                    </button>
                  ) : null}

                  <button type="button" className={toolbarButtonClassName} title="Filter (coming soon)" aria-label="Filter (coming soon)" disabled>
                    <Filter className="size-4" />
                  </button>

                  {layerToolSettings.showTable ? (
                    <button
                      type="button"
                      className={toolbarButtonClassName}
                      onClick={() => onOpenLayerTable(layer.id)}
                      title={hasInsightsData ? "Open layer table" : "Table is available for uploaded vector layers"}
                      aria-label={hasInsightsData ? "Open layer table" : "Table is unavailable for this layer"}
                      disabled={!hasInsightsData}
                    >
                      <Table2 className="size-4" />
                    </button>
                  ) : null}

                  <button type="button" className={toolbarButtonClassName} title="Download (coming soon)" aria-label="Download (coming soon)" disabled>
                    <Download className="size-4" />
                  </button>

                  {layerToolSettings.showChart ? (
                    <button
                      type="button"
                      className={toolbarButtonClassName}
                      onClick={() => onOpenLayerChart(layer.id)}
                      title={hasInsightsData ? "Open layer chart" : "Chart is available for uploaded vector layers"}
                      aria-label={hasInsightsData ? "Open layer chart" : "Chart is unavailable for this layer"}
                      disabled={!hasInsightsData}
                    >
                      <BarChart3 className="size-4" />
                    </button>
                  ) : null}

                  {layerToolSettings.showLabels ? (
                    <button
                      type="button"
                      className={cn(toolbarButtonClassName, isLabelEnabled && "bg-emerald-500/20 text-emerald-200")}
                      ref={(element) => {
                        labelPopoverTriggerRefs.current[layer.id] = element;
                      }}
                      onClick={() => {
                        setLabelPopoverLayerId((current) => (current === layer.id ? null : layer.id));
                        setMoreMenuLayerId(null);
                        setInfoPopoverLayerId(null);
                      }}
                      title={
                        hasLabelFieldOptions
                          ? isLabelEnabled
                            ? "Configure labels (currently on)"
                            : "Configure labels"
                          : "No attributes available for labels"
                      }
                      aria-label="Configure labels"
                      disabled={!hasLabelFieldOptions}
                    >
                      <Type className="size-4" />
                    </button>
                  ) : null}

                  {layerToolSettings.showStyle ? (
                    <button
                      type="button"
                      className={toolbarButtonClassName}
                      onClick={() => {
                        setStyleLayerId(layer.id);
                        setMoreMenuLayerId(null);
                        setInfoPopoverLayerId(null);
                        setLabelPopoverLayerId(null);
                      }}
                      title="Layer style"
                      aria-label="Layer style"
                    >
                      <Palette className="size-4" />
                    </button>
                  ) : null}

                  {layerToolSettings.showMore ? (
                    <button
                      type="button"
                      className={toolbarButtonClassName}
                      ref={(element) => {
                        moreMenuTriggerRefs.current[layer.id] = element;
                      }}
                      onClick={() => {
                        setMoreMenuLayerId((current) => (current === layer.id ? null : layer.id));
                        setInfoPopoverLayerId(null);
                        setLabelPopoverLayerId(null);
                      }}
                      title="More actions"
                      aria-label="More actions"
                    >
                      <EllipsisVertical className="size-4" />
                    </button>
                  ) : null}
                </div>

                {layerToolSettings.showInfo && infoPopoverLayerId === layer.id ? (
                  <div
                    ref={(element) => {
                      infoPopoverRefs.current[layer.id] = element;
                    }}
                    className="absolute right-20 top-12 z-20 w-56 rounded-lg border border-slate-600/75 bg-slate-950/95 p-3 text-[0.7rem] text-slate-300 shadow-[0_14px_34px_rgba(15,23,42,0.45)]"
                  >
                    <p>Source: {toSentenceCase(layer.sourceMode)}</p>
                    <p>Data Type: {getLayerDataTypeLabel(layer)}</p>
                    <p>Data Format: {getLayerDataFormat(layer)}</p>
                  </div>
                ) : null}

                {layerToolSettings.showLabels && labelPopoverLayerId === layer.id ? (
                  <div
                    ref={(element) => {
                      labelPopoverRefs.current[layer.id] = element;
                    }}
                    className="absolute right-[8.6rem] top-[4.9rem] z-20 w-64 rounded-lg border border-slate-600/75 bg-slate-950/95 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.45)]"
                  >
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-slate-300">Labels</p>
                    {hasLabelFieldOptions ? (
                      <>
                        <label className="mt-2 block text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Label Field</label>
                        <select
                          value={layer.labelField ?? ""}
                          onChange={(event) => {
                            const nextField = event.target.value.trim();
                            onSetLayerLabelConfig(layer.id, {
                              field: nextField,
                              enabled: Boolean(nextField),
                            });
                          }}
                          className="mt-1 h-8 w-full rounded-md border border-slate-600 bg-slate-900 px-2 text-xs text-slate-100"
                        >
                          <option value="">Select a property</option>
                          {labelFieldOptions.map((fieldName) => (
                            <option key={fieldName} value={fieldName}>
                              {fieldName}
                            </option>
                          ))}
                        </select>

                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-emerald-400"
                            checked={isLabelEnabled}
                            onChange={(event) =>
                              onSetLayerLabelConfig(layer.id, {
                                enabled: event.target.checked,
                              })
                            }
                            disabled={!layer.labelField}
                          />
                          Show labels on map
                        </label>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">No attributes found. Labels are available for vector layers with feature properties.</p>
                    )}
                  </div>
                ) : null}

                {layerToolSettings.showMore && moreMenuLayerId === layer.id ? (
                  <div
                    ref={(element) => {
                      moreMenuPopoverRefs.current[layer.id] = element;
                    }}
                    className="absolute right-11 top-[4.9rem] z-20 w-56 rounded-lg border border-slate-600/75 bg-slate-950/95 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.45)] space-y-3"
                  >
                    <div>
                      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-slate-300">Opacity</p>
                      <div className="mt-2 flex items-center gap-2">
                        <SlidersHorizontal className="size-3.5 text-slate-400" />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(layer.opacity * 100)}
                          onChange={(event) => {
                            onSetLayerOpacity(layer.id, Number(event.target.value) / 100);
                          }}
                          className="h-1.5 w-full accent-emerald-400"
                        />
                        <span className="w-9 text-right text-xs font-medium text-slate-200">{Math.round(layer.opacity * 100)}%</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-700/75 pt-2">
                      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-slate-300">Interactions</p>
                      <div className="mt-2 space-y-2">
                        <label className="flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            className="rounded border-slate-600 bg-slate-900 accent-emerald-500"
                            checked={layer.interactionConfig?.tooltipEnabled !== false}
                            onChange={(e) => onSetLayerInteractionConfig(layer.id, { tooltipEnabled: e.target.checked })}
                          />
                          Enable Tooltips
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-200">
                          <input
                            type="checkbox"
                            className="rounded border-slate-600 bg-slate-900 accent-emerald-500"
                            checked={layer.interactionConfig?.popupEnabled !== false}
                            onChange={(e) => onSetLayerInteractionConfig(layer.id, { popupEnabled: e.target.checked })}
                          />
                          Enable Popups
                        </label>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={layerToolSettings.showRename && Boolean(renameLayerId)}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
      >
        <DialogContent className="max-w-sm border-border/80 bg-background">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const nextName = renameValue.trim();
              if (!renameTargetLayer || !nextName) {
                return;
              }
              onRenameLayer(renameTargetLayer.id, nextName);
              closeRenameDialog();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Rename Layer</DialogTitle>
              <DialogDescription>
                Update the layer name shown in the map workspace.
              </DialogDescription>
            </DialogHeader>

            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Layer name"
              autoFocus
              className="border-border/80"
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRenameDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {styleTargetLayer && (
        <LayerStyleDialog
          isOpen={layerToolSettings.showStyle}
          onClose={closeStyleDialog}
          layer={styleTargetLayer}
          stylePresetOptions={stylePresetOptions}
          markerStyleOptions={markerStyleOptions}
          markerSymbolOptions={markerSymbolOptions}
          colorRampOptions={colorRampOptions}
          styleTargetDefaults={styleTargetDefaults}
          defaultStyleConfig={DEFAULT_STYLE_CONFIG}
          onSetLayerStylePreset={onSetLayerStylePreset}
          onSetLayerStyleConfig={onSetLayerStyleConfig}
          handleCustomMarkerUpload={handleCustomMarkerUpload}
          getLayerStyleFieldOptions={getLayerStyleFieldOptions}
          clampValue={clampValue}
          getLayerDisplayName={getLayerDisplayName}
        />
      )}
    </div>
  );
}
