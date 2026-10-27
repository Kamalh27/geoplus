// Side effect: points maplibre-gl at the same-origin worker. Must run before any Map is created.
import "@/lib/maps/maplibreWorker";
import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import * as maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { detectDarkMode, getBasemapStyle, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { DEFAULT_FLAT_CENTER, DEFAULT_FLAT_ZOOM, DEFAULT_GLOBE_CENTER, DEFAULT_GLOBE_ZOOM } from "@/components/geoplus/map/constants";
import { createDrawControl } from "@/components/geoplus/map/draw-control";
import { attachDrawEvents } from "@/components/geoplus/map/draw-events";
import type { DrawMeasurements, DrawMode, DrawPurpose, DrawTemplate, MapProjectionMode } from "@/components/geoplus/map/types";

type UseMapInitArgs = {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<maplibregl.Map | null>;
  drawRef: RefObject<MapboxDraw | null>;
  deckOverlayRef: RefObject<MapLibreOverlay | null>;
  scaleControlRef: RefObject<maplibregl.ScaleControl | null>;
  markerRef: RefObject<maplibregl.Marker | null>;
  searchAbortRef: RefObject<AbortController | null>;
  currentThemeRef: RefObject<"dark" | "light" | null>;
  selectedBasemapRef: RefObject<GeoPlusBasemapId>;
  projectionModeRef: RefObject<MapProjectionMode>;
  userLayersRef: RefObject<GeoPlusLayerItem[]>;
  drawPurposeRef: RefObject<DrawPurpose>;
  activeDrawTemplateRef: RefObject<DrawTemplate | null>;
  setDrawPurpose: Dispatch<SetStateAction<DrawPurpose>>;
  setSelectedDrawFeature: Dispatch<SetStateAction<GeoJSON.Feature | null>>;
  setDrawMeasurements: Dispatch<SetStateAction<DrawMeasurements>>;
  setActiveDrawMode: Dispatch<SetStateAction<DrawMode>>;
  defaultProjectionMode: MapProjectionMode;
  applyProjectionMode: (map: maplibregl.Map, mode: MapProjectionMode) => void;
  fitGlobeToViewport: (map: maplibregl.Map, animate: boolean) => void;
  syncMapLibreLayers: (map: maplibregl.Map, layers: GeoPlusLayerItem[]) => void;
  syncDeckLayers: (map: maplibregl.Map, currentLayers: GeoPlusLayerItem[]) => void;
  showScaleBar: boolean | undefined;
};

export function useMapInit({
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
  showScaleBar,
}: UseMapInitArgs) {
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const isDark = detectDarkMode();
    currentThemeRef.current = isDark ? "dark" : "light";
    const initialCenter = defaultProjectionMode === "globe" ? DEFAULT_GLOBE_CENTER : DEFAULT_FLAT_CENTER;
    const initialZoom = defaultProjectionMode === "globe" ? DEFAULT_GLOBE_ZOOM : DEFAULT_FLAT_ZOOM;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getBasemapStyle(selectedBasemapRef.current, isDark),
      center: initialCenter,
      zoom: initialZoom,
      // @ts-expect-error MapLibre globe projection is supported at runtime but missing from this type surface.
      projection: {
        type: defaultProjectionMode === "globe" ? "globe" : "mercator",
      },
      attributionControl: false,
    });
    mapRef.current = map;
    applyProjectionMode(map, projectionModeRef.current);

    // Initialize Drawing Control
    const draw = createDrawControl();
    drawRef.current = draw;
    map.addControl(draw as unknown as maplibregl.IControl);

    attachDrawEvents(map, draw, {
      drawRef,
      drawPurposeRef,
      activeDrawTemplateRef,
      setDrawPurpose,
      setSelectedDrawFeature,
      setDrawMeasurements,
      setActiveDrawMode,
    });

    map.once("load", () => {
      applyProjectionMode(map, projectionModeRef.current);
      if (projectionModeRef.current === "globe") {
        fitGlobeToViewport(map, false);
      }
      syncMapLibreLayers(map, userLayersRef.current);
      void syncDeckLayers(map, userLayersRef.current);

      if (showScaleBar !== false) {
        scaleControlRef.current = new maplibregl.ScaleControl({
          maxWidth: 112,
          unit: "metric",
        });
        map.addControl(scaleControlRef.current, "bottom-left");
      }
    });

    return () => {
      if (scaleControlRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(scaleControlRef.current);
        } catch {
          // Ignore
        }
      }
      scaleControlRef.current = null;
      if (deckOverlayRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(deckOverlayRef.current);
        } catch {
          // Ignore
        }
        deckOverlayRef.current.finalize();
        deckOverlayRef.current = null;
      }
      markerRef.current?.remove();
      markerRef.current = null;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      currentThemeRef.current = null;
    };
  }, [applyProjectionMode, defaultProjectionMode, fitGlobeToViewport, syncDeckLayers, syncMapLibreLayers, showScaleBar, activeDrawTemplateRef, currentThemeRef, deckOverlayRef, drawPurposeRef, drawRef, mapContainerRef, mapRef, markerRef, projectionModeRef, scaleControlRef, searchAbortRef, selectedBasemapRef, setActiveDrawMode, setDrawMeasurements, setDrawPurpose, setSelectedDrawFeature, userLayersRef]);
}
