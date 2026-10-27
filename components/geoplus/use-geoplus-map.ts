"use client";

import { useRef, useState } from "react";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";

import type { GeoPlusBasemapId } from "@/components/geoplus/map-style";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import type { AppSettings } from "@/components/geoplus/use-app-settings";
import type { MapProjectionMode } from "@/components/geoplus/map/types";
import { useBasemapSync } from "@/components/geoplus/map/use-basemap-sync";
import { useDrawActions } from "@/components/geoplus/map/use-draw-actions";
import { useDrawState } from "@/components/geoplus/map/use-draw-state";
import { useFeatureInteractions } from "@/components/geoplus/map/use-feature-interactions";
import { useGeolocation } from "@/components/geoplus/map/use-geolocation";
import { useLayerSyncCallbacks } from "@/components/geoplus/map/use-layer-sync-callbacks";
import { useMapInit } from "@/components/geoplus/map/use-map-init";
import { useMapNavigation } from "@/components/geoplus/map/use-map-navigation";
import { useMapPanels } from "@/components/geoplus/map/use-map-panels";
import { useMapProjection } from "@/components/geoplus/map/use-map-projection";
import { useMapSearch } from "@/components/geoplus/map/use-map-search";
import { useMapViewState } from "@/components/geoplus/map/use-map-view-state";
import { usePopupMediaClick } from "@/components/geoplus/map/use-popup-media-click";
import { useProtocolRegistration } from "@/components/geoplus/map/use-protocol-registration";
import { useUserLayersSync } from "@/components/geoplus/map/use-user-layers-sync";
import { useZoomRequests } from "@/components/geoplus/map/use-zoom-requests";

export type {
  DrawMode,
  DrawPurpose,
  DrawMeasurements,
  DrawTemplateField,
  DrawTemplate,
} from "@/components/geoplus/map/types";

export function useGeoPlusMap(
  selectedBasemapId: GeoPlusBasemapId,
  userLayers: GeoPlusLayerItem[],
  zoomToLayerRequest: { layerId: string; nonce: number } | null = null,
  zoomToFeatureRequest: { feature: GeoJSON.Feature; nonce: number } | null = null,
  settings?: AppSettings,
  onSaveDrawLayer?: (name: string, features: GeoJSON.FeatureCollection) => void,
) {
  const defaultProjectionMode: MapProjectionMode = "globe";
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);
  const scaleControlRef = useRef<maplibregl.ScaleControl | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipPopupRef = useRef<maplibregl.Popup | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const currentThemeRef = useRef<"dark" | "light" | null>(null);
  const deckHoverActiveRef = useRef(false);
  const mapLibreHoverActiveRef = useRef(false);
  const selectedBasemapRef = useRef<GeoPlusBasemapId>(selectedBasemapId);
  const projectionModeRef = useRef<MapProjectionMode>(defaultProjectionMode);
  const userLayersRef = useRef<GeoPlusLayerItem[]>(userLayers);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const {
    activeDrawMode,
    setActiveDrawMode,
    selectedDrawFeature,
    setSelectedDrawFeature,
    drawMeasurements,
    setDrawMeasurements,
    activeDrawTemplate,
    setActiveDrawTemplate,
    drawPurposeRef,
    drawPurpose,
    setDrawPurpose,
    activeDrawTemplateRef,
  } = useDrawState();

  // Global click listener for popup media elements
  const { mediaViewerData, setMediaViewerData } = usePopupMediaClick();

  const { applyProjectionMode, fitGlobeToViewport, setStyleWithProjection } = useMapProjection(projectionModeRef);

  const { syncMapLibreLayers, syncDeckLayers } = useLayerSyncCallbacks({
    deckOverlayRef,
    popupRef,
    tooltipPopupRef,
    deckHoverActiveRef,
    mapLibreHoverActiveRef,
    showLayerTooltips: settings?.showLayerTooltips,
    showLayerPopups: settings?.showLayerPopups,
  });

  useProtocolRegistration();

  useMapInit({
    mapContainerRef,
    mapRef,
    drawRef,
    deckOverlayRef,
    scaleControlRef,
    markerRef,
    searchAbortRef,
    currentThemeRef,
    selectedBasemapRef,
    projectionModeRef,
    userLayersRef,
    drawPurposeRef,
    activeDrawTemplateRef,
    setDrawPurpose,
    setSelectedDrawFeature,
    setDrawMeasurements,
    setActiveDrawMode,
    defaultProjectionMode,
    applyProjectionMode,
    fitGlobeToViewport,
    syncMapLibreLayers,
    syncDeckLayers,
    showScaleBar: settings?.showScaleBar,
  });

  const { isMapRendering } = useUserLayersSync({
    mapRef,
    userLayers,
    userLayersRef,
    syncMapLibreLayers,
    syncDeckLayers,
  });

  // Interaction handlers for MapLibre layers
  useFeatureInteractions({
    mapRef,
    userLayersRef,
    popupRef,
    tooltipPopupRef,
    deckHoverActiveRef,
    mapLibreHoverActiveRef,
    showLayerTooltips: settings?.showLayerTooltips,
    showLayerPopups: settings?.showLayerPopups,
  });

  useZoomRequests({ mapRef, userLayersRef, zoomToLayerRequest, zoomToFeatureRequest, setStatusMessage });

  const { mapBearing, mapViewMode, setMapViewMode } = useMapViewState(mapRef);

  const {
    isSearchPanelOpen,
    isLegendPanelOpen,
    isAttributionOpen,
    toggleSearchPanel,
    toggleLegendPanel,
    toggleAttributionPanel,
    closeAttributionPanel,
  } = useMapPanels(searchInputRef);

  useBasemapSync({ mapRef, currentThemeRef, selectedBasemapRef, selectedBasemapId, setStyleWithProjection });

  const {
    isFullscreen,
    mapProjectionMode,
    setMapMarker,
    flyToCoordinates,
    zoomIn,
    zoomOut,
    resetNavigation,
    setMapMode,
    toggleProjectionMode,
    toggleFullscreen,
  } = useMapNavigation({
    mapRef,
    mapRootRef,
    markerRef,
    projectionModeRef,
    defaultProjectionMode,
    applyProjectionMode,
    fitGlobeToViewport,
    setMapViewMode,
    setStatusMessage,
  });

  const { searchQuery, setSearchQuery, searchResults, isSearching, focusSearchResult, runSearch } = useMapSearch({
    searchAbortRef,
    flyToCoordinates,
    setMapMarker,
    setStatusMessage,
  });

  const { isLocating, goToCurrentLocation } = useGeolocation({
    mapRef,
    flyToCoordinates,
    setMapMarker,
    setStatusMessage,
  });

  const {
    setDrawMode,
    deleteSelectedDraw,
    clearAllDrawings,
    updateDrawFeatureProperty,
    saveDrawingsAsLayer,
    simplifySelectedDraw,
    smoothSelectedDraw,
  } = useDrawActions({
    drawRef,
    drawPurposeRef,
    activeDrawTemplate,
    activeDrawTemplateRef,
    setDrawPurpose,
    setActiveDrawMode,
    setSelectedDrawFeature,
    setDrawMeasurements,
    onSaveDrawLayer,
  });

  return {
    mapRootRef,
    mapContainerRef,
    searchInputRef,
    isMapRendering,
    isFullscreen,
    isLocating,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isSearchPanelOpen,
    isLegendPanelOpen,
    isAttributionOpen,
    mapViewMode,
    mapProjectionMode,
    statusMessage,
    mapBearing,
    activeDrawMode,
    drawPurpose,
    selectedDrawFeature,
    drawMeasurements,
    setDrawMeasurements,
    activeDrawTemplate,
    setActiveDrawTemplate,
    mediaViewerData,
    setMediaViewerData,
    toggleSearchPanel,
    toggleLegendPanel,
    toggleAttributionPanel,
    closeAttributionPanel,
    setMapMode,
    toggleProjectionMode,
    runSearch,
    focusSearchResult,
    zoomIn,
    zoomOut,
    resetNavigation,
    goToCurrentLocation,
    toggleFullscreen,
    setDrawMode,
    deleteSelectedDraw,
    clearAllDrawings,
    updateDrawFeatureProperty,
    saveDrawingsAsLayer,
    simplifySelectedDraw,
    smoothSelectedDraw,
  };
}
