import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import maplibregl from "maplibre-gl";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { getGeoJsonLngLatBounds, getLayerLngLatBounds } from "@/lib/geoplus/map-layer-renderers";

type UseZoomRequestsArgs = {
  mapRef: RefObject<maplibregl.Map | null>;
  userLayersRef: RefObject<GeoPlusLayerItem[]>;
  zoomToLayerRequest: { layerId: string; nonce: number } | null;
  zoomToFeatureRequest: { feature: GeoJSON.Feature; nonce: number } | null;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
};

export function useZoomRequests({
  mapRef,
  userLayersRef,
  zoomToLayerRequest,
  zoomToFeatureRequest,
  setStatusMessage,
}: UseZoomRequestsArgs) {
  useEffect(() => {
    if (!zoomToLayerRequest) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const targetLayer = userLayersRef.current.find((layer) => layer.id === zoomToLayerRequest.layerId);
    if (!targetLayer) {
      setStatusMessage("Layer no longer exists.");
      return;
    }

    const bounds = getLayerLngLatBounds(targetLayer);
    if (!bounds) {
      setStatusMessage("Layer extent is unavailable for zoom.");
      return;
    }

    map.fitBounds(bounds, {
      padding: {
        top: 70,
        right: 70,
        bottom: 70,
        left: 70,
      },
      duration: 560,
      essential: true,
    });
    setStatusMessage(null);
  }, [zoomToLayerRequest, mapRef, setStatusMessage, userLayersRef]);

  useEffect(() => {
    if (!zoomToFeatureRequest) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const bounds = getGeoJsonLngLatBounds(zoomToFeatureRequest.feature);
    if (!bounds) {
      setStatusMessage("Feature geometry is unavailable for zoom.");
      return;
    }

    map.fitBounds(bounds, {
      padding: {
        top: 56,
        right: 56,
        bottom: 56,
        left: 56,
      },
      duration: 480,
      essential: true,
    });
    setStatusMessage(null);
  }, [zoomToFeatureRequest, mapRef, setStatusMessage]);
}
