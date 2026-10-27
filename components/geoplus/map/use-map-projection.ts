import { useCallback } from "react";
import type { RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { GeoPlusBasemapStyle } from "@/components/geoplus/map-style";
import { DEFAULT_GLOBE_CENTER, GLOBE_VIEW_BOUNDS } from "@/components/geoplus/map/constants";
import type { MapProjectionMode } from "@/components/geoplus/map/types";

export function useMapProjection(projectionModeRef: RefObject<MapProjectionMode>) {
  const applyProjectionMode = useCallback((map: maplibregl.Map, mode: MapProjectionMode) => {
    const projectionType = mode === "globe" ? "globe" : "mercator";
    const applyProjection = () => {
      try {
        map.setProjection({
          type: projectionType,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Style is not done loading")) {
          map.once("style.load", () => {
            map.setProjection({
              type: projectionType,
            });
          });
          return;
        }

        throw error;
      }
    };

    if (map.isStyleLoaded()) {
      applyProjection();
      return;
    }

    map.once("style.load", () => {
      applyProjection();
    });
  }, []);

  const fitGlobeToViewport = useCallback((map: maplibregl.Map, animate: boolean) => {
    const camera = map.cameraForBounds(GLOBE_VIEW_BOUNDS, {
      padding: {
        top: 36,
        right: 36,
        bottom: 36,
        left: 36,
      },
    });

    if (camera?.center && typeof camera.zoom === "number") {
      const nextCamera = {
        center: camera.center,
        zoom: camera.zoom,
        pitch: 0,
        bearing: 0,
        essential: true,
      };

      if (animate) {
        map.easeTo({
          ...nextCamera,
          duration: 420,
        });
      } else {
        map.jumpTo(nextCamera);
      }
      return;
    }

    const canvas = map.getCanvas();
    const minViewportSize = Math.max(320, Math.min(canvas.clientWidth, canvas.clientHeight));
    const fallbackZoom = Math.max(-1.5, Math.min(1.2, Math.log2(minViewportSize / 512)));
    const fallbackCamera = {
      center: DEFAULT_GLOBE_CENTER,
      zoom: fallbackZoom,
      pitch: 0,
      bearing: 0,
      essential: true,
    };

    if (animate) {
      map.easeTo({
        ...fallbackCamera,
        duration: 420,
      });
    } else {
      map.jumpTo(fallbackCamera);
    }
  }, []);

  const setStyleWithProjection = useCallback(
    (map: maplibregl.Map, style: GeoPlusBasemapStyle) => {
      map.setStyle(style);
      map.once("style.load", () => {
        applyProjectionMode(map, projectionModeRef.current);
      });
    },
    [applyProjectionMode, projectionModeRef],
  );

  return { applyProjectionMode, fitGlobeToViewport, setStyleWithProjection };
}
