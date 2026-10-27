import { useEffect, useState } from "react";
import type { RefObject } from "react";
import maplibregl from "maplibre-gl";

export function useMapViewState(mapRef: RefObject<maplibregl.Map | null>) {
  const [mapBearing, setMapBearing] = useState(0);
  const [mapViewMode, setMapViewMode] = useState<"2d" | "3d">("2d");

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const updateBearing = () => {
      setMapBearing(map.getBearing());
    };

    updateBearing();
    map.on("rotate", updateBearing);
    return () => {
      map.off("rotate", updateBearing);
    };
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const updateMapViewMode = () => {
      setMapViewMode(map.getPitch() > 1 ? "3d" : "2d");
    };

    updateMapViewMode();
    map.on("pitch", updateMapViewMode);
    map.on("moveend", updateMapViewMode);
    return () => {
      map.off("pitch", updateMapViewMode);
      map.off("moveend", updateMapViewMode);
    };
  }, [mapRef]);

  return { mapBearing, mapViewMode, setMapViewMode };
}
