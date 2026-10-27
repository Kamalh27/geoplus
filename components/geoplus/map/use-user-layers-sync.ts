import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { areLayersEquivalentForRender } from "@/components/geoplus/map/layer-equality";

type UseUserLayersSyncArgs = {
  mapRef: RefObject<maplibregl.Map | null>;
  userLayers: GeoPlusLayerItem[];
  userLayersRef: RefObject<GeoPlusLayerItem[]>;
  syncMapLibreLayers: (map: maplibregl.Map, layers: GeoPlusLayerItem[]) => void;
  syncDeckLayers: (map: maplibregl.Map, currentLayers: GeoPlusLayerItem[]) => void;
};

export function useUserLayersSync({
  mapRef,
  userLayers,
  userLayersRef,
  syncMapLibreLayers,
  syncDeckLayers,
}: UseUserLayersSyncArgs) {
  const [isMapRendering, setIsMapRendering] = useState(false);
  const previousUserLayersRef = useRef<GeoPlusLayerItem[]>(userLayers);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const onStyleLoad = () => {
      syncMapLibreLayers(map, userLayersRef.current);
      void syncDeckLayers(map, userLayersRef.current);
    };

    map.on("style.load", onStyleLoad);
    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [syncDeckLayers, syncMapLibreLayers, mapRef, userLayersRef]);

  useEffect(() => {
    userLayersRef.current = userLayers;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      previousUserLayersRef.current = userLayers;
      return;
    }

    if (areLayersEquivalentForRender(previousUserLayersRef.current, userLayers)) {
      previousUserLayersRef.current = userLayers;
      return;
    }
    previousUserLayersRef.current = userLayers;

    // Show a rendering indicator if the map hasn't gone idle within 400 ms.
    const showTimer = setTimeout(() => setIsMapRendering(true), 400);
    const onIdle = () => {
      clearTimeout(showTimer);
      setIsMapRendering(false);
    };
    map.off("idle", onIdle);
    map.once("idle", onIdle);

    syncMapLibreLayers(map, userLayers);
    void syncDeckLayers(map, userLayers);

    return () => {
      clearTimeout(showTimer);
      map.off("idle", onIdle);
    };
  }, [syncDeckLayers, syncMapLibreLayers, userLayers, mapRef, userLayersRef]);

  return { isMapRendering };
}
