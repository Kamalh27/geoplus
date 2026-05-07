"use client";

import Image from "next/image";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers3, Map, PanelLeftOpen, Settings2, Sparkles, Wrench, Search, BookMarked, Plus, Compass, Box, Globe, LocateFixed, Maximize2, Megaphone, type LucideIcon } from "lucide-react";

import { GuidedTour } from "@/components/geoplus/guided-tour";
import { AiAssistantPanel } from "@/components/geoplus/ai/ai-assistant-panel";
import { SettingsPanel } from "@/components/geoplus/settings-panel";
import { useAppSettings } from "@/components/geoplus/use-app-settings";
import { GeoPlusMap } from "@/components/geoplus-map";
import { BasemapStylePanel } from "@/components/geoplus/basemap-style-panel";
import { GeoPlusBottomTableCard } from "@/components/geoplus/bottom-table-card";
import { LayerPanel } from "@/components/geoplus/layer-panel";
import { DEFAULT_GLOBE_BASEMAP_ID, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import { GeoPlusRightInsightsPanel } from "@/components/geoplus/right-insights-panel";
import { SpatialToolsPanel } from "@/components/geoplus/spatial-tools-panel";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { GeoPlusHeader } from "@/components/geoplus/header-actions";
import { Button } from "@/components/ui/button";
import { AnnouncementsDialog } from "@/components/geoplus/announcements-dialog";
import { UserManualDialog } from "@/components/geoplus/user-manual-dialog";
import { isGeoJsonFeatureCollection, runDuckDbSpatialAnalysis } from "@/lib/geoplus/duckdb-spatial-analytics";
import { runBasicSpatialAnalysis } from "@/lib/geoplus/spatial-analysis";
import { cn } from "@/lib/utils";

type WorkspaceTab = "layers" | "tools" | "basemap" | "ai" | "settings";
type HelpDialogId = "announcement" | "guide" | "user-manual" | "bug-fix-form";
type GuideTopicId = "sidebar" | "header-actions" | "layers" | "tools" | "basemap" | "ai" | "settings" | "map-search" | "map-zoom" | "map-compass" | "map-3d" | "map-projection" | "map-legend" | "map-locate" | "map-fullscreen";
import { BugFixDialog } from "@/components/geoplus/bug-fix-dialog";

const workspaceTabs: {
  id: WorkspaceTab;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "layers",
    label: "Layers",
    title: "Layer Manager",
    description: "Organize operational layers, toggle visibility, and control layer draw order.",
    icon: Layers3,
  },
  {
    id: "tools",
    label: "Tools",
    title: "Spatial Tools",
    description: "Access measure, select, inspect, and annotate utilities for map-based workflows.",
    icon: Wrench,
  },
  {
    id: "basemap",
    label: "Basemap",
    title: "Basemap Controls",
    description: "Switch base styles and tune map context to match analysis and presentation needs.",
    icon: Map,
  },
  {
    id: "ai",
    label: "AI Assistant",
    title: "AI Assistant",
    description: "Use AI prompts to accelerate spatial analysis and generate map-ready insights.",
    icon: Sparkles,
  },
  {
    id: "settings",
    label: "Settings",
    title: "Workspace Settings",
    description: "Manage map defaults, interaction preferences, and user-specific workspace options.",
    icon: Settings2,
  },
];

const guideTourTopics: {
  id: GuideTopicId;
  title: string;
  description: string;
  details: string;
  targetTab?: WorkspaceTab;
  icon: LucideIcon;
  targetId: string;
  position: "right" | "left" | "top" | "bottom";
}[] = [
  {
    id: "sidebar",
    title: "Sidebar Control Center",
    description: "Your primary workspace navigation and data management hub.",
    details: "The sidebar allows you to switch between layers, tools, and analysis workflows. It can be collapsed to maximize map real estate while keeping critical functions accessible.",
    icon: PanelLeftOpen,
    targetId: "geoplus-sidebar",
    position: "right",
  },
  {
    id: "header-actions",
    title: "Workspace Actions",
    description: "Access announcements, documentation, and the guided tour.",
    details: "Stay up-to-date with the latest features, report bugs, or revisit this tour at any time from these quick-access header tools.",
    icon: Megaphone,
    targetId: "geoplus-header-actions",
    position: "right",
  },
  {
    id: "layers",
    title: "Layer Management",
    description: "Organize, style, and analyze your geospatial data layers.",
    details: "Access detailed controls for opacity, visibility, and rendering styles. This is where you'll manage your active datasets and their visual hierarchy on the map.",
    targetTab: "layers",
    icon: Layers3,
    targetId: "geoplus-tab-layers",
    position: "right",
  },
  {
    id: "tools",
    title: "Analysis & Data Tools",
    description: "Advanced spatial operations and attribute inspection.",
    details: "The tools workspace is where you perform data filtering, run spatial analysis (like buffer/clip), and inspect attribute tables for your vector datasets.",
    targetTab: "tools",
    icon: Wrench,
    targetId: "geoplus-tab-tools",
    position: "right",
  },
  {
    id: "basemap",
    title: "Basemap Configuration",
    description: "Switch your base map style to fit your analysis.",
    details: "Choose from various basemaps (e.g., satellite, light, dark, terrain) to provide the best context for your operational overlays.",
    targetTab: "basemap",
    icon: Map,
    targetId: "geoplus-tab-basemap",
    position: "right",
  },
  {
    id: "ai",
    title: "AI Spatial Assistant",
    description: "Use natural language to interrogate your spatial data.",
    details: "Accelerate your workflows by asking the AI Assistant to generate DuckDB SQL queries, filter datasets, or summarize complex spatial attributes.",
    targetTab: "ai",
    icon: Sparkles,
    targetId: "geoplus-tab-ai",
    position: "right",
  },
  {
    id: "settings",
    title: "Workspace Settings",
    description: "Customize your environment and default preferences.",
    details: "Manage UI toggles, default map projections, auto-zoom behavior, and interface scales to match your personal workflow.",
    targetTab: "settings",
    icon: Settings2,
    targetId: "geoplus-tab-settings",
    position: "right",
  },
  {
    id: "map-search",
    title: "Map Search",
    description: "Quickly locate places and addresses.",
    details: "Open the search panel to geocode addresses, find cities, or navigate directly to specific coordinates anywhere on the globe.",
    icon: Search,
    targetId: "geoplus-map-search-btn",
    position: "left",
  },
  {
    id: "map-zoom",
    title: "Zoom Controls",
    description: "Adjust your map scale.",
    details: "Use the plus and minus buttons to zoom in and out of the map for more detailed or broader spatial context.",
    icon: Plus,
    targetId: "geoplus-map-zoom-controls",
    position: "left",
  },
  {
    id: "map-compass",
    title: "Compass & Bearing",
    description: "Reorient your view to North.",
    details: "When navigating in 3D or rotated 2D view, click the compass to instantly reset your bearing to true North.",
    icon: Compass,
    targetId: "geoplus-map-compass-btn",
    position: "left",
  },
  {
    id: "map-3d",
    title: "2D / 3D Perspective",
    description: "Toggle map pitch.",
    details: "Switch between a traditional top-down 2D view and an angled 3D perspective to visualize terrain or extruded polygons.",
    icon: Box,
    targetId: "geoplus-map-3d-btn",
    position: "left",
  },
  {
    id: "map-projection",
    title: "Map Projection",
    description: "Switch between flat map and 3D globe.",
    details: "Toggle between a Web Mercator projection (flat) and a 3D globe projection for global datasets to minimize distortion at high latitudes.",
    icon: Globe,
    targetId: "geoplus-map-projection-btn",
    position: "left",
  },
  {
    id: "map-legend",
    title: "Dynamic Legend",
    description: "Understand active layer symbology at a glance.",
    details: "Toggle the map legend to see the color ramps, classification breaks, and labels for all currently visible layers on the map.",
    icon: BookMarked,
    targetId: "geoplus-map-legend-btn",
    position: "left",
  },
  {
    id: "map-locate",
    title: "Current Location",
    description: "Find your physical position.",
    details: "Click to request browser geolocation and center the map on your current real-world coordinates.",
    icon: LocateFixed,
    targetId: "geoplus-map-locate-btn",
    position: "left",
  },
  {
    id: "map-fullscreen",
    title: "Fullscreen Mode",
    description: "Maximize your map canvas.",
    details: "Enter fullscreen mode to hide the browser UI and focus entirely on your spatial data analysis and presentation.",
    icon: Maximize2,
    targetId: "geoplus-map-fullscreen-btn",
    position: "left",
  },
];

const getLayerSourceFeatureCollection = (layer: GeoPlusLayerItem): GeoJSON.FeatureCollection | null => {
  if (isGeoJsonFeatureCollection(layer.rawInlineData)) {
    return layer.rawInlineData;
  }
  if (isGeoJsonFeatureCollection(layer.inlineData)) {
    return layer.inlineData;
  }
  return null;
};

const shouldUseDuckDbForLayer = (layer: GeoPlusLayerItem) => getLayerSourceFeatureCollection(layer) !== null;

const inferDerivedLayerType = (featureCollection: GeoJSON.FeatureCollection) =>
  featureCollection.features.every((feature) => feature.geometry?.type === "Point") ? "scatterplot" : "geojson";

const buildDerivedAnalysisLayer = (args: {
  sourceLayer: GeoPlusLayerItem;
  featureCollection: GeoJSON.FeatureCollection;
  operation: "buffer" | "clip";
  summary: string;
  clipLayerName?: string;
  bufferDistance?: number;
  bufferUnit?: string;
}): GeoPlusLayerItem => {
  const { sourceLayer, featureCollection, operation, summary, clipLayerName, bufferDistance, bufferUnit } = args;
  const operationSuffix =
    operation === "buffer"
      ? `Buffer ${bufferDistance ?? ""} ${bufferUnit ?? ""}`.trim()
      : `Clip ${clipLayerName ? `to ${clipLayerName}` : "Extent"}`;

  return {
    id: `${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: `${sourceLayer.name} ${operationSuffix}`.trim(),
    sourceMode: "analysis",
    engine: "deck",
    layerType: inferDerivedLayerType(featureCollection),
    rendererPreference: "deck",
    layerTypePreference: "geojson",
    rawInlineData: featureCollection,
    inlineData: featureCollection,
    detectionSummary: summary,
    visible: true,
    opacity: 0.82,
    stylePreset: operation === "buffer" ? "amber" : "sky",
    styleConfig: undefined,
    labelEnabled: false,
    labelField: undefined,
  };
};

export function GeoPlusShell() {
  const { settings } = useAppSettings();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const sidebarWrapperRef = useRef<HTMLDivElement | null>(null);
  const themeModeRef = useRef<"dark" | "light" | null>(null);
  const layersRef = useRef<GeoPlusLayerItem[]>([]);
  const duckDbRunByLayerRef = useRef<Record<string, number>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [leftSafeArea, setLeftSafeArea] = useState("0.75rem");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("layers");
  const [sessionBasemapId, setSessionBasemapId] = useState<GeoPlusBasemapId | null>(null);
  const [layers, setLayers] = useState<GeoPlusLayerItem[]>([]);
  const [selectedToolsLayerId, setSelectedToolsLayerId] = useState("");
  const [openToolRequest, setOpenToolRequest] = useState<{ toolId: string; nonce: number } | null>(null);
  const [bottomPanelTab, setBottomPanelTab] = useState<"table" | "shell" | "none">("none");
  const [isChartPanelVisible, setIsChartPanelVisible] = useState(false);
  const [zoomToLayerRequest, setZoomToLayerRequest] = useState<{ layerId: string; nonce: number } | null>(null);
  const [zoomToFeatureRequest, setZoomToFeatureRequest] = useState<{ feature: GeoJSON.Feature; nonce: number } | null>(null);
  const [activeHelpDialog, setActiveHelpDialog] = useState<HelpDialogId | null>(null);
  const [activeGuideTopicIndex, setActiveGuideTopicIndex] = useState(0);
  const selectedBasemapRef = useRef<GeoPlusBasemapId>(DEFAULT_GLOBE_BASEMAP_ID);
  const selectedBasemapId = sessionBasemapId ?? settings.defaultBasemap ?? DEFAULT_GLOBE_BASEMAP_ID;

  const activeTabContent = workspaceTabs.find((tab) => tab.id === activeTab) ?? workspaceTabs[0];
  const queryableLayers = useMemo(() => layers.filter((layer) => getLayerSourceFeatureCollection(layer) !== null), [layers]);
  const selectedToolsLayer = useMemo(
    () => queryableLayers.find((layer) => layer.id === selectedToolsLayerId) ?? queryableLayers[0] ?? null,
    [queryableLayers, selectedToolsLayerId],
  );

  const handleGuideStepChange = useCallback((index: number) => {
    const topic = guideTourTopics[index];
    if (topic?.targetTab) {
      setActiveTab(topic.targetTab);
      setIsSidebarCollapsed(false);
    }
    setActiveGuideTopicIndex(index);
  }, []);

  const openHelpDialog = useCallback((dialogId: HelpDialogId) => {
    if (dialogId === "guide") {
      handleGuideStepChange(0);
    }
    setActiveHelpDialog(dialogId);
  }, [handleGuideStepChange]);

  const goToNextGuideTopic = useCallback(() => {
    handleGuideStepChange(Math.min(activeGuideTopicIndex + 1, guideTourTopics.length - 1));
  }, [activeGuideTopicIndex, handleGuideStepChange]);

  const goToPreviousGuideTopic = useCallback(() => {
    handleGuideStepChange(Math.max(0, activeGuideTopicIndex - 1));
  }, [activeGuideTopicIndex, handleGuideStepChange]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    selectedBasemapRef.current = selectedBasemapId;
  }, [selectedBasemapId]);

  const applyDuckDbFilter = useCallback(
    async (
      layerId: string,
      whereClause: string,
      chartLabelColumn?: string,
      sourceOverride?: GeoJSON.FeatureCollection,
    ) => {
    const currentRunId = (duckDbRunByLayerRef.current[layerId] ?? 0) + 1;
    duckDbRunByLayerRef.current[layerId] = currentRunId;

    const currentLayer = layersRef.current.find((layer) => layer.id === layerId);
    if (!currentLayer && !sourceOverride) {
      return;
    }

    const sourceFeatureCollection = sourceOverride ?? (currentLayer ? getLayerSourceFeatureCollection(currentLayer) : null);
    if (!sourceFeatureCollection) {
      setLayers((previousLayers) =>
        previousLayers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                duckDbStatus: "error",
                duckDbError: "This layer does not contain queryable vector features.",
              }
            : layer,
        ),
      );
      return;
    }

    setLayers((previousLayers) =>
      previousLayers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              rawInlineData: sourceFeatureCollection,
              duckDbStatus: "processing",
              duckDbError: undefined,
            }
          : layer,
      ),
    );

    try {
      const analysis = await runDuckDbSpatialAnalysis({
        sourceFeatureCollection,
        whereClause,
        chartLabelColumn,
      });
      if (duckDbRunByLayerRef.current[layerId] !== currentRunId) {
        return;
      }

      setLayers((previousLayers) =>
        previousLayers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                rawInlineData: sourceFeatureCollection,
                inlineData: analysis.filteredFeatureCollection,
                duckDbColumns: analysis.availableColumns,
                duckDbWhereClause: analysis.whereClause === "TRUE" ? "" : analysis.whereClause,
                duckDbChartLabelColumn: analysis.chartLabelColumn,
                duckDbChartColumns: analysis.chartColumns,
                duckDbChartData: analysis.chartData,
                duckDbFilterFields: analysis.filterFields,
                duckDbDatasetProfile: analysis.datasetProfile,
                duckDbRowCount: analysis.rowCount,
                duckDbStatus: "ready",
                duckDbError: undefined,
              }
            : layer,
        ),
      );
    } catch (error) {
      if (duckDbRunByLayerRef.current[layerId] !== currentRunId) {
        return;
      }
      const message = error instanceof Error ? error.message : "DuckDB filtering failed.";
      setLayers((previousLayers) =>
        previousLayers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                duckDbStatus: "error",
                duckDbError: message,
              }
            : layer,
        ),
      );
    }
    },
    [],
  );

  const handleClearAllFilters = useCallback(() => {
    for (const layer of layersRef.current) {
      if (layer.duckDbWhereClause) {
        void applyDuckDbFilter(layer.id, "");
      }
    }
  }, [applyDuckDbFilter]);

  const onAddLayer = useCallback(
    (layer: GeoPlusLayerItem) => {
      const nextLayer: GeoPlusLayerItem =
        shouldUseDuckDbForLayer(layer)
          ? {
              ...layer,
              rawInlineData: layer.inlineData,
              duckDbStatus: "processing",
              duckDbError: undefined,
            }
          : layer;

      setLayers((previousLayers) => [...previousLayers, nextLayer]);
      if (settings.autoZoomToLayers) {
        setZoomToLayerRequest({
          layerId: nextLayer.id,
          nonce: Date.now(),
        });
      }

      const sourceFeatureCollection = getLayerSourceFeatureCollection(nextLayer);
      if (sourceFeatureCollection) {
        void applyDuckDbFilter(nextLayer.id, "", undefined, sourceFeatureCollection);
      }
    },
    [applyDuckDbFilter, settings.autoZoomToLayers],
  );

  const runLayerAnalysis = useCallback(
    async (args: {
      sourceLayerId: string;
      operation: "buffer" | "clip";
      bufferDistance?: number;
      bufferUnit?: "meters" | "kilometers" | "miles";
      clipLayerId?: string;
    }) => {
      const sourceLayer = layersRef.current.find((layer) => layer.id === args.sourceLayerId);
      const sourceFeatureCollection = sourceLayer ? getLayerSourceFeatureCollection(sourceLayer) : null;
      if (!sourceLayer || !sourceFeatureCollection) {
        throw new Error("Pick a valid vector layer before running analysis.");
      }

      const clipLayer = args.clipLayerId ? layersRef.current.find((layer) => layer.id === args.clipLayerId) : null;
      const clipFeatureCollection = clipLayer ? getLayerSourceFeatureCollection(clipLayer) : null;
      const analysisResult = runBasicSpatialAnalysis({
        sourceFeatureCollection,
        operation: args.operation,
        bufferDistance: args.bufferDistance,
        bufferUnit: args.bufferUnit,
        clipFeatureCollection: clipFeatureCollection ?? undefined,
      });

      const derivedLayer = buildDerivedAnalysisLayer({
        sourceLayer,
        featureCollection: analysisResult.featureCollection,
        operation: args.operation,
        summary: analysisResult.summary,
        clipLayerName: clipLayer?.name,
        bufferDistance: args.bufferDistance,
        bufferUnit: args.bufferUnit,
      });

      setLayers((previousLayers) => [...previousLayers, derivedLayer]);
      if (settings.autoZoomToLayers) {
        setZoomToLayerRequest({
          layerId: derivedLayer.id,
          nonce: Date.now(),
        });
      }
      await applyDuckDbFilter(derivedLayer.id, "", undefined, analysisResult.featureCollection);
    },
    [applyDuckDbFilter, settings.autoZoomToLayers],
  );

  const openLayerTableInToolsTab = useCallback((layerId: string) => {
    setSelectedToolsLayerId(layerId);
    setBottomPanelTab("table");
  }, []);

  const openLayerFilterInToolsTab = useCallback((layerId: string) => {
    setSelectedToolsLayerId(layerId);
    setActiveTab("tools");
    setIsSidebarCollapsed(false);
    setBottomPanelTab("none");
    setOpenToolRequest({ toolId: "filter", nonce: Date.now() });
  }, []);

  const openShellInToolsTab = useCallback(() => {
    setBottomPanelTab("shell");
  }, []);

  const openLayerChartInToolsTab = useCallback((layerId: string) => {
    setSelectedToolsLayerId(layerId);
    setIsChartPanelVisible(true);
  }, []);

  useEffect(() => {
    const updateLeftSafeArea = () => {
      if (isSidebarCollapsed) {
        setLeftSafeArea("0.75rem");
        return;
      }

      const shellRect = shellRef.current?.getBoundingClientRect();
      const sidebarRect = sidebarWrapperRef.current?.getBoundingClientRect();
      if (!shellRect || !sidebarRect) {
        return;
      }

      const nextOffset = `${Math.round(Math.max(12, sidebarRect.right - shellRect.left + 12))}px`;
      setLeftSafeArea((previousOffset) => (previousOffset === nextOffset ? previousOffset : nextOffset));
    };

    updateLeftSafeArea();
    window.addEventListener("resize", updateLeftSafeArea);

    const observer = new ResizeObserver(updateLeftSafeArea);
    if (shellRef.current) {
      observer.observe(shellRef.current);
    }
    if (sidebarWrapperRef.current) {
      observer.observe(sidebarWrapperRef.current);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLeftSafeArea);
    };
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const root = document.documentElement;

    const syncBasemapWithThemeToggle = () => {
      const nextTheme: "dark" | "light" = root.classList.contains("dark") ? "dark" : "light";
      if (themeModeRef.current === null) {
        themeModeRef.current = nextTheme;
        return;
      }

      if (themeModeRef.current === nextTheme) {
        return;
      }

      themeModeRef.current = nextTheme;
      if (selectedBasemapRef.current === "dark" || selectedBasemapRef.current === "light") {
        setSessionBasemapId(nextTheme === "dark" ? "dark" : "light");
      }
    };

    syncBasemapWithThemeToggle();
    const observer = new MutationObserver(syncBasemapWithThemeToggle);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className="relative h-[100dvh] w-full overflow-hidden"
      style={
        {
          "--geoplus-left-safe-area": leftSafeArea,
        } as CSSProperties
      }
    >
      <div className="absolute inset-0">
        <GeoPlusMap
          selectedBasemapId={selectedBasemapId}
          layers={layers}
          zoomToLayerRequest={zoomToLayerRequest}
          zoomToFeatureRequest={zoomToFeatureRequest}
          onToggleLayerVisibility={(layerId) => {
            setLayers((previous) => previous.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)));
          }}
          onClearFilters={handleClearAllFilters}
        />
      </div>

      <div
        ref={sidebarWrapperRef}
        id="geoplus-sidebar"
        className={cn(
          "absolute z-30",
          isSidebarCollapsed
            ? "left-2 top-2 sm:left-3 sm:top-3"
            : "bottom-2 left-2 top-2 w-[320px] max-w-[calc(100vw-1rem)] sm:bottom-3 sm:left-3 sm:top-3 sm:max-w-[calc(100vw-1.5rem)]",
        )}
      >
        {isSidebarCollapsed ? (
          <Button
            variant="secondary"
            size="icon"
            title="Show sidebar"
            aria-label="Show sidebar"
            className="rounded-[10px] border border-border/70 bg-background/95 shadow-lg backdrop-blur-md"
            onClick={() => setIsSidebarCollapsed(false)}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        ) : (
          <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lg backdrop-blur-md">
            <GeoPlusHeader 
              settings={settings}
              onOpenDialog={openHelpDialog}
              onToggleSidebar={() => setIsSidebarCollapsed(true)}
            />

            <div className="-mx-3 mt-3 grid w-[calc(100%+1.5rem)] grid-cols-5 border-b border-border/70 px-3">
                {workspaceTabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const TabIcon = tab.icon;

                  return (
                    <Button
                      key={tab.id}
                      id={`geoplus-tab-${tab.id}`}
                      variant="ghost"
                      size="icon-sm"
                      title={tab.label}
                      aria-label={tab.label}
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.id === "tools") {
                          setBottomPanelTab("none");
                          setIsChartPanelVisible(false);
                        }
                      }}
                      className={cn(
                        "-mb-px h-9 w-full rounded-none border-b-2 border-transparent transition-colors",
                        isActive
                          ? "bg-transparent text-accent border-b-accent hover:bg-transparent hover:text-accent"
                          : "hover:bg-accent/15 hover:text-accent dark:hover:bg-accent/20 dark:hover:text-foreground",
                      )}
                    >
                      <TabIcon className="size-4" />
                    </Button>
                  );
                })}
              </div>

            <div className="geoplus-panel-scroll flex-1 overflow-y-auto pl-1.5 pr-1">
              {activeTab === "layers" ? (
                <LayerPanel
                  layers={layers}
                  onAddLayer={onAddLayer}
                  onToggleLayerVisibility={(layerId) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) =>
                        layer.id === layerId
                          ? {
                              ...layer,
                              visible: !layer.visible,
                            }
                          : layer,
                      ),
                    );
                  }}
                  onSetLayerOpacity={(layerId, opacity) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) =>
                        layer.id === layerId
                          ? {
                              ...layer,
                              opacity: Math.max(0, Math.min(1, opacity)),
                            }
                          : layer,
                      ),
                    );
                  }}
                  onSetLayerStylePreset={(layerId, preset) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) =>
                        layer.id === layerId
                          ? {
                              ...layer,
                              stylePreset: preset,
                              styleConfig: layer.styleConfig
                                ? {
                                    ...layer.styleConfig,
                                    fillColor: undefined,
                                    lineColor: undefined,
                                    pointColor: undefined,
                                    labelColor: undefined,
                                  }
                                : undefined,
                            }
                          : layer,
                      ),
                    );
                  }}
                  onSetLayerStyleConfig={(layerId, styleConfig) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) =>
                        layer.id === layerId
                          ? {
                              ...layer,
                              styleConfig: {
                                ...(layer.styleConfig ?? {}),
                                ...styleConfig,
                              },
                            }
                          : layer,
                      ),
                    );
                  }}
                  onSetLayerLabelConfig={(layerId, config) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) => {
                        if (layer.id !== layerId) {
                          return layer;
                        }

                        const nextLabelField =
                          config.field !== undefined ? (config.field.trim() || undefined) : layer.labelField;
                        const nextEnabled =
                          config.enabled !== undefined
                            ? config.enabled && Boolean(nextLabelField)
                            : layer.labelEnabled && Boolean(nextLabelField);

                        return {
                          ...layer,
                          labelField: nextLabelField,
                          labelEnabled: nextEnabled,
                        };
                      }),
                    );
                  }}
                  onSetLayerInteractionConfig={(layerId, config) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) => {
                        if (layer.id !== layerId) {
                          return layer;
                        }
                        return {
                          ...layer,
                          interactionConfig: {
                            ...(layer.interactionConfig ?? {}),
                            ...(config.tooltipEnabled !== undefined ? { tooltipEnabled: config.tooltipEnabled } : {}),
                            ...(config.popupEnabled !== undefined ? { popupEnabled: config.popupEnabled } : {}),
                            ...(config.tooltipFields !== undefined ? { tooltipFields: config.tooltipFields } : {}),
                            ...(config.popupFields !== undefined ? { popupFields: config.popupFields } : {}),
                            ...(config.fieldDisplayNames !== undefined ? { fieldDisplayNames: config.fieldDisplayNames } : {}),
                            ...(config.hoverHighlightEnabled !== undefined ? { hoverHighlightEnabled: config.hoverHighlightEnabled } : {}),
                            ...(config.hoverHighlightColor !== undefined ? { hoverHighlightColor: config.hoverHighlightColor } : {}),
                            ...(config.hoverLineColor !== undefined ? { hoverLineColor: config.hoverLineColor } : {}),
                            ...(config.hoverFillOpacity !== undefined ? { hoverFillOpacity: config.hoverFillOpacity } : {}),
                            ...(config.hoverLineWidth !== undefined ? { hoverLineWidth: config.hoverLineWidth } : {}),
                            ...(config.hoverPointRadius !== undefined ? { hoverPointRadius: config.hoverPointRadius } : {}),
                          },
                        };
                      }),
                    );
                  }}
                  onRenameLayer={async (layerId, nextName) => {
                    setLayers((previousLayers) =>
                      previousLayers.map((layer) =>
                        layer.id === layerId
                          ? {
                              ...layer,
                              name: nextName,
                            }
                          : layer,
                      ),
                    );
                  }}
                  onRemoveLayer={(layerId) => {
                    setLayers((previousLayers) => previousLayers.filter((layer) => layer.id !== layerId));
                  }}
                  onReorderLayer={(draggedLayerId, targetLayerId, placement) => {
                    setLayers((previousLayers) => {
                      const draggedIndex = previousLayers.findIndex((layer) => layer.id === draggedLayerId);
                      if (draggedIndex < 0) {
                        return previousLayers;
                      }

                      const targetIndex = previousLayers.findIndex((layer) => layer.id === targetLayerId);
                      if (targetIndex < 0 || targetIndex === draggedIndex) {
                        return previousLayers;
                      }

                      const nextLayers = [...previousLayers];
                      const [draggedLayer] = nextLayers.splice(draggedIndex, 1);
                      const targetIndexAfterRemoval = nextLayers.findIndex((layer) => layer.id === targetLayerId);
                      const insertIndex = placement === "after" ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;

                      nextLayers.splice(Math.max(0, insertIndex), 0, draggedLayer);
                      return nextLayers;
                    });
                  }}
                  onZoomToLayer={(layerId) => {
                    setZoomToLayerRequest({
                      layerId,
                      nonce: Date.now(),
                    });
                  }}
                  onOpenLayerFilter={openLayerFilterInToolsTab}
                  onOpenLayerTable={openLayerTableInToolsTab}
                  onOpenLayerChart={openLayerChartInToolsTab}
                />
              ) : activeTab === "tools" ? (
                <SpatialToolsPanel
                  key={openToolRequest?.nonce ?? "tools-panel"}
                  layers={layers}
                  selectedLayerId={selectedToolsLayerId}
                  initialToolId={openToolRequest?.toolId}
                  onApplyFilter={async (layerId, whereClause, chartLabelColumn) => {
                    await applyDuckDbFilter(layerId, whereClause, chartLabelColumn);
                  }}
                  onRunSpatialAnalysis={runLayerAnalysis}
                  onSelectedLayerChange={(layerId) => setSelectedToolsLayerId(layerId ?? "")}
                  onOpenShell={openShellInToolsTab}
                />
              ) : activeTab === "basemap" ? (
                <BasemapStylePanel selectedBasemapId={selectedBasemapId} onSelectBasemap={setSessionBasemapId} />
              ) : activeTab === "ai" ? (
                <AiAssistantPanel layers={layers} />
              ) : activeTab === "settings" ? (
                <SettingsPanel />
              ) : (
                <div className="space-y-2 px-5 py-3">
                  <p className="text-sm font-semibold text-foreground">{activeTabContent.title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{activeTabContent.description}</p>
                </div>
              )}            </div>

            <div className="h-px bg-border/70" />

            <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[0.64rem] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Powered by</span>
              <Image src="/logo.svg" alt="SPADACE logo" width={16} height={16} className="size-4" />
              <span>SPADACE</span>
            </div>
          </aside>
        )}
      </div>

      <GuidedTour
        steps={guideTourTopics}
        activeStepIndex={activeGuideTopicIndex}
        isOpen={activeHelpDialog === "guide"}
        onClose={() => {
          setActiveHelpDialog(null);
          setActiveTab("layers");
          setIsSidebarCollapsed(false);
        }}
        onNext={goToNextGuideTopic}
        onPrev={goToPreviousGuideTopic}
        onStepClick={setActiveGuideTopicIndex}
      />

      <BugFixDialog 
        isOpen={activeHelpDialog === "bug-fix-form"} 
        onOpenChange={(isOpen) => setActiveHelpDialog(isOpen ? "bug-fix-form" : null)} 
      />

      <AnnouncementsDialog 
        isOpen={activeHelpDialog === "announcement"} 
        onOpenChange={(isOpen) => setActiveHelpDialog(isOpen ? "announcement" : null)} 
      />

      <UserManualDialog 
        isOpen={activeHelpDialog === "user-manual"} 
        onOpenChange={(isOpen) => setActiveHelpDialog(isOpen ? "user-manual" : null)}
        onOpenGuidedTour={() => openHelpDialog("guide")}
      />

      <GeoPlusBottomTableCard
        key={selectedToolsLayer?.id ?? "no-table-layer"}
        activeTab={bottomPanelTab}
        onTabChange={setBottomPanelTab}
        onClose={() => setBottomPanelTab("none")}
        layer={selectedToolsLayer}
        layers={queryableLayers}
        onSelectLayer={setSelectedToolsLayerId}
        reserveRightPanelSpace={isChartPanelVisible}
        onZoomToFeature={(feature) => {
          setZoomToFeatureRequest({
            feature,
            nonce: Date.now(),
          });
        }}
        onApplyFilter={(layerId, whereClause) => {
          void applyDuckDbFilter(layerId, whereClause);
        }}
      />
      <GeoPlusRightInsightsPanel 
        isVisible={isChartPanelVisible} 
        layer={selectedToolsLayer} 
        isTablePanelVisible={bottomPanelTab !== "none"} 
        onClose={() => setIsChartPanelVisible(false)} 
        onChangeChartColumn={async (layerId, chartColumn) => {
          const currentLayer = layersRef.current.find((l) => l.id === layerId);
          if (currentLayer) {
            await applyDuckDbFilter(layerId, currentLayer.duckDbWhereClause ?? "", chartColumn);
          }
        }}
      />
    </div>
  );
}
