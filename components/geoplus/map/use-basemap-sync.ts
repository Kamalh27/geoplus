import { useEffect } from "react";
import type { RefObject } from "react";
import maplibregl from "maplibre-gl";
import { detectDarkMode, getBasemapStyle, type GeoPlusBasemapId, type GeoPlusBasemapStyle } from "@/components/geoplus/map-style";

type UseBasemapSyncArgs = {
  mapRef: RefObject<maplibregl.Map | null>;
  currentThemeRef: RefObject<"dark" | "light" | null>;
  selectedBasemapRef: RefObject<GeoPlusBasemapId>;
  selectedBasemapId: GeoPlusBasemapId;
  setStyleWithProjection: (map: maplibregl.Map, style: GeoPlusBasemapStyle) => void;
};

export function useBasemapSync({
  mapRef,
  currentThemeRef,
  selectedBasemapRef,
  selectedBasemapId,
  setStyleWithProjection,
}: UseBasemapSyncArgs) {
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    const root = document.documentElement;
    const updateBasemapFromTheme = () => {
      const isDark = detectDarkMode();
      const nextTheme = isDark ? "dark" : "light";

      if (currentThemeRef.current === nextTheme) {
        return;
      }

      if (!mapRef.current) {
        return;
      }

      setStyleWithProjection(mapRef.current, getBasemapStyle(selectedBasemapRef.current, isDark));
      currentThemeRef.current = nextTheme;
    };

    const observer = new MutationObserver(updateBasemapFromTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
    };
  }, [setStyleWithProjection, currentThemeRef, mapRef, selectedBasemapRef]);

  useEffect(() => {
    selectedBasemapRef.current = selectedBasemapId;

    const map = mapRef.current;
    if (!map) {
      return;
    }

    setStyleWithProjection(map, getBasemapStyle(selectedBasemapId, detectDarkMode()));
  }, [selectedBasemapId, setStyleWithProjection, mapRef, selectedBasemapRef]);
}
