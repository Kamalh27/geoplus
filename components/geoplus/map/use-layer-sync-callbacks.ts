import { useCallback } from "react";
import type { RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { buildDeckUserLayers, syncMapLibreUserLayers } from "@/lib/geoplus/map-layer-renderers";
import { deckObjectToGeoJsonFeature, getDeckClickLngLat, supportsFeatureInteractions } from "@/components/geoplus/map/feature-utils";
import { buildHoverHighlightStyle, clearHoverHighlightFeature, setHoverHighlightFeature } from "@/components/geoplus/map/hover-highlight";
import { buildPopupHtml, buildTooltipHtml } from "@/components/geoplus/map/popup-html";

type UseLayerSyncCallbacksArgs = {
  deckOverlayRef: RefObject<MapLibreOverlay | null>;
  popupRef: RefObject<maplibregl.Popup | null>;
  tooltipPopupRef: RefObject<maplibregl.Popup | null>;
  deckHoverActiveRef: RefObject<boolean>;
  mapLibreHoverActiveRef: RefObject<boolean>;
  showLayerTooltips: boolean | undefined;
  showLayerPopups: boolean | undefined;
};

export function useLayerSyncCallbacks({
  deckOverlayRef,
  popupRef,
  tooltipPopupRef,
  deckHoverActiveRef,
  mapLibreHoverActiveRef,
  showLayerTooltips,
  showLayerPopups,
}: UseLayerSyncCallbacksArgs) {
  const syncMapLibreLayers = useCallback((map: maplibregl.Map, layers: GeoPlusLayerItem[]) => {
    syncMapLibreUserLayers(map, layers);
  }, []);

  const syncDeckLayers = useCallback((map: maplibregl.Map, currentLayers: GeoPlusLayerItem[]) => {
    let overlay = deckOverlayRef.current;
    if (!overlay) {
      overlay = new MapLibreOverlay({
        interleaved: true,
        layers: [],
      });
      map.addControl(overlay);
      deckOverlayRef.current = overlay;
    }

    const userDeckLayers = buildDeckUserLayers(currentLayers);

    overlay.setProps({
      layers: userDeckLayers,
      onHover: (info: Record<string, unknown>) => {
        if (!info.object || !info.layer) {
          if (mapLibreHoverActiveRef.current) {
            deckHoverActiveRef.current = false;
            return;
          }
          deckHoverActiveRef.current = false;
          if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
          clearHoverHighlightFeature(map);
          map.getCanvas().style.cursor = "";
          return;
        }

        const layerInfo = info.layer as { id: string };
        const rawId = layerInfo.id.replace(/^user-/, "");
        const appLayer = currentLayers.find((l) => {
          const safeId = l.id.replace(/[^a-zA-Z0-9_-]/g, "-");
          return rawId === safeId || rawId.startsWith(`${safeId}-`);
        });

        if (appLayer && supportsFeatureInteractions(appLayer)) {
           mapLibreHoverActiveRef.current = false;
           deckHoverActiveRef.current = true;
           map.getCanvas().style.cursor = "pointer";
           const obj = info.object as Record<string, unknown>;
           const properties = (obj.properties as Record<string, unknown>) || obj;
           const hoverFeature = deckObjectToGeoJsonFeature(obj);
           if (appLayer.interactionConfig?.hoverHighlightEnabled !== false && hoverFeature) {
             const hoverStyle = buildHoverHighlightStyle(appLayer, hoverFeature.geometry.type);
             setHoverHighlightFeature(map, hoverFeature, hoverStyle);
           } else {
             clearHoverHighlightFeature(map);
           }

           const coord = getDeckClickLngLat(map, info, obj);
           if (showLayerTooltips !== false && appLayer.interactionConfig?.tooltipEnabled !== false && coord) {
             const html = buildTooltipHtml(appLayer, properties);
             if (!tooltipPopupRef.current) {
                tooltipPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-tooltip" });
             }
             tooltipPopupRef.current.setLngLat([coord[0], coord[1]]).setHTML(html).addTo(map);
           } else if (tooltipPopupRef.current) {
             tooltipPopupRef.current.remove();
           }
        } else {
           deckHoverActiveRef.current = false;
           if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
           clearHoverHighlightFeature(map);
           map.getCanvas().style.cursor = "";
        }
      },
      onClick: (info: Record<string, unknown>) => {
        if (!info.object || !info.layer || showLayerPopups === false) return;
        
        const layerInfo = info.layer as { id: string };
        const rawId = layerInfo.id.replace(/^user-/, "");
        const appLayer = currentLayers.find((l) => {
          const safeId = l.id.replace(/[^a-zA-Z0-9_-]/g, "-");
          return rawId === safeId || rawId.startsWith(`${safeId}-`);
        });

        if (appLayer && supportsFeatureInteractions(appLayer) && appLayer.interactionConfig?.popupEnabled !== false) {
           const obj = info.object as Record<string, unknown>;
           const properties = (obj.properties as Record<string, unknown>) || obj;
           const html = buildPopupHtml(appLayer, properties);

           const coord = getDeckClickLngLat(map, info, obj);
           if (html && coord) {
             popupRef.current?.remove();
             popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-popup" });
             popupRef.current.setLngLat([coord[0], coord[1]]).setHTML(html).addTo(map);
           }
        }
      },
    });
  }, [showLayerTooltips, showLayerPopups, deckHoverActiveRef, deckOverlayRef, mapLibreHoverActiveRef, popupRef, tooltipPopupRef]);

  return { syncMapLibreLayers, syncDeckLayers };
}
