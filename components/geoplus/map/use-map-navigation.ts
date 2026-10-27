import { useCallback, useEffect, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import maplibregl from "maplibre-gl";
import type { MapProjectionMode } from "@/components/geoplus/map/types";

type UseMapNavigationArgs = {
  mapRef: RefObject<maplibregl.Map | null>;
  mapRootRef: RefObject<HTMLDivElement | null>;
  markerRef: RefObject<maplibregl.Marker | null>;
  projectionModeRef: RefObject<MapProjectionMode>;
  defaultProjectionMode: MapProjectionMode;
  applyProjectionMode: (map: maplibregl.Map, mode: MapProjectionMode) => void;
  fitGlobeToViewport: (map: maplibregl.Map, animate: boolean) => void;
  setMapViewMode: Dispatch<SetStateAction<"2d" | "3d">>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
};

export function useMapNavigation({
  mapRef,
  mapRootRef,
  markerRef,
  projectionModeRef,
  defaultProjectionMode,
  applyProjectionMode,
  fitGlobeToViewport,
  setMapViewMode,
  setStatusMessage,
}: UseMapNavigationArgs) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapProjectionMode, setMapProjectionMode] = useState<MapProjectionMode>(defaultProjectionMode);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === mapRootRef.current);
      mapRef.current?.resize();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [mapRef, mapRootRef]);

  const setMapMarker = useCallback((longitude: number, latitude: number) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!markerRef.current) {
      const markerElement = document.createElement("div");
      markerElement.setAttribute("aria-hidden", "true");
      markerElement.className = "relative flex h-6 w-6 items-center justify-center";
      markerElement.innerHTML = `
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50"></span>
        <span class="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-background bg-accent shadow-[0_2px_8px_rgba(0,0,0,0.35)]"></span>
      `;

      markerRef.current = new maplibregl.Marker({
        element: markerElement,
        anchor: "center",
      });
    }

    markerRef.current.setLngLat([longitude, latitude]).addTo(map);
  }, [mapRef, markerRef]);

  const flyToCoordinates = useCallback((longitude: number, latitude: number, zoom = 14) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (map.isZooming() || map.isMoving()) {
      map.stop();
    }

    map.flyTo({
      center: [longitude, latitude],
      zoom,
      essential: true,
      speed: 1.2,
      curve: 1.42,
      maxDuration: 2500,
    });
  }, [mapRef]);

  const zoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 240 });
  }, [mapRef]);

  const zoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 240 });
  }, [mapRef]);

  const resetNavigation = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.easeTo({
      bearing: 0,
      pitch: 0,
      duration: 360,
      essential: true,
    });
    setMapViewMode("2d");
  }, [mapRef, setMapViewMode]);

  const setMapMode = useCallback((mode: "2d" | "3d") => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.easeTo({
      pitch: mode === "3d" ? 60 : 0,
      duration: 420,
      essential: true,
    });
    setMapViewMode(mode);
  }, [mapRef, setMapViewMode]);

  const toggleProjectionMode = useCallback(() => {
    const nextMode: MapProjectionMode = projectionModeRef.current === "globe" ? "flat" : "globe";
    projectionModeRef.current = nextMode;
    setMapProjectionMode(nextMode);

    const map = mapRef.current;
    if (!map) {
      return;
    }

    applyProjectionMode(map, nextMode);
    if (nextMode === "globe") {
      fitGlobeToViewport(map, true);
    }
  }, [applyProjectionMode, fitGlobeToViewport, mapRef, projectionModeRef]);

  const toggleFullscreen = useCallback(async () => {
    if (!mapRootRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === mapRootRef.current) {
        await document.exitFullscreen();
      } else {
        await mapRootRef.current.requestFullscreen();
      }
      setStatusMessage(null);
    } catch {
      setStatusMessage("Fullscreen is unavailable in this browser.");
    }
  }, [mapRootRef, setStatusMessage]);

  return {
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
  };
}
