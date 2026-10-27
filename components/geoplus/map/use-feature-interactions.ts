import { useEffect } from "react";
import type { RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { MAPLIBRE_LAYER_PREFIX } from "@/lib/geoplus/map-layer-renderers";
import { mapFeatureToGeoJsonFeature, supportsFeatureInteractions } from "@/components/geoplus/map/feature-utils";
import { buildHoverHighlightStyle, clearHoverHighlightFeature, setHoverHighlightFeature } from "@/components/geoplus/map/hover-highlight";
import { buildPopupHtml, buildTooltipHtml } from "@/components/geoplus/map/popup-html";

type UseFeatureInteractionsArgs = {
  mapRef: RefObject<maplibregl.Map | null>;
  userLayersRef: RefObject<GeoPlusLayerItem[]>;
  popupRef: RefObject<maplibregl.Popup | null>;
  tooltipPopupRef: RefObject<maplibregl.Popup | null>;
  deckHoverActiveRef: RefObject<boolean>;
  mapLibreHoverActiveRef: RefObject<boolean>;
  showLayerTooltips: boolean | undefined;
  showLayerPopups: boolean | undefined;
};

export function useFeatureInteractions({
  mapRef,
  userLayersRef,
  popupRef,
  tooltipPopupRef,
  deckHoverActiveRef,
  mapLibreHoverActiveRef,
  showLayerTooltips,
  showLayerPopups,
}: UseFeatureInteractionsArgs) {
  // Interaction handlers for MapLibre layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const managedLayerSuffixes = ["-fill", "-line", "-point", "-marker", "-label", "-raster"] as const;
    const toSafeMapLibreLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");
    const getAppLayerIdFromMapLibreLayerId = (maplibreLayerId: string) => {
      if (!maplibreLayerId.startsWith(MAPLIBRE_LAYER_PREFIX)) {
        return null;
      }

      const rawId = maplibreLayerId.slice(MAPLIBRE_LAYER_PREFIX.length);
      const layerId = rawId.startsWith("src-") ? rawId.slice("src-".length) : rawId;
      const suffix = managedLayerSuffixes.find((candidate) => layerId.endsWith(candidate));
      return suffix ? layerId.slice(0, -suffix.length) : layerId;
    };

    const findAppLayer = (maplibreLayerId: string) => {
      const layerId = getAppLayerIdFromMapLibreLayerId(maplibreLayerId);
      if (!layerId) {
        return undefined;
      }
      const exactLayer = userLayersRef.current.find((layer) => toSafeMapLibreLayerId(layer.id) === layerId);
      if (exactLayer) {
        return exactLayer;
      }

      return userLayersRef.current.find((layer) => {
        const safeLayerId = toSafeMapLibreLayerId(layer.id);
        return (
          layerId.startsWith(`${safeLayerId}-`) ||
          layerId.startsWith(`pmtiles-${safeLayerId}-`) ||
          layerId.startsWith(`mbtiles-${safeLayerId}-`)
        );
      });
    };

    const getInteractiveFeature = (features: maplibregl.MapGeoJSONFeature[]) => {
      for (const feature of features) {
        const appLayer = findAppLayer(feature.layer.id);
        if (appLayer && supportsFeatureInteractions(appLayer)) {
          return { feature, appLayer };
        }
      }
      return null;
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point).filter((feature) => feature.layer.id.startsWith(MAPLIBRE_LAYER_PREFIX));
      const hit = getInteractiveFeature(features);

      if (hit) {
        mapLibreHoverActiveRef.current = true;
        deckHoverActiveRef.current = false;
        map.getCanvas().style.cursor = "pointer";
        const { feature, appLayer } = hit;

        if (appLayer.interactionConfig?.hoverHighlightEnabled !== false) {
          const hoverFeature = mapFeatureToGeoJsonFeature(feature);
          if (hoverFeature) {
            const hoverStyle = buildHoverHighlightStyle(appLayer, hoverFeature.geometry.type);
            setHoverHighlightFeature(map, hoverFeature, hoverStyle);
          } else {
            clearHoverHighlightFeature(map);
          }
        } else {
          clearHoverHighlightFeature(map);
        }

        if (showLayerTooltips !== false && appLayer.interactionConfig?.tooltipEnabled !== false) {
          const html = buildTooltipHtml(appLayer, feature.properties);
          if (html) {
            if (!tooltipPopupRef.current) {
              tooltipPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-tooltip" });
            }
            tooltipPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
            return;
          }
        } else if (tooltipPopupRef.current) {
          tooltipPopupRef.current.remove();
        }
        return;
      } else {
        mapLibreHoverActiveRef.current = false;
        if (deckHoverActiveRef.current) {
          return;
        }
        map.getCanvas().style.cursor = "";
      }
      if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
      clearHoverHighlightFeature(map);
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (showLayerPopups === false) return;

      const features = map.queryRenderedFeatures(e.point).filter((feature) => feature.layer.id.startsWith(MAPLIBRE_LAYER_PREFIX));
      const hit = getInteractiveFeature(features);

      if (hit) {
        const { feature, appLayer } = hit;

        if (appLayer.interactionConfig?.popupEnabled !== false) {
          const html = buildPopupHtml(appLayer, feature.properties);
          if (html) {
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-popup" });
            // For polygons, e.lngLat is just where they clicked. For points we could use geometry coordinates, but e.lngLat is reliable.
            popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
          }
        }
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("click", handleClick);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("click", handleClick);
    };
  }, [showLayerTooltips, showLayerPopups, deckHoverActiveRef, mapLibreHoverActiveRef, mapRef, popupRef, tooltipPopupRef, userLayersRef]);
}
