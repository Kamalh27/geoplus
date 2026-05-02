import maplibregl from "maplibre-gl";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";

let cogProtocolRegistered = false;

const COG_PROTOCOL_NAME = "cog";
const COG_LAYER_PREFIX = "geoplus-user-cog-";
const COG_PROXY_PATH = "/api/geoplus/cog";
const OFFICIAL_SAMPLE_COG_URL = "https://labs.geomatico.es/maplibre-cog-protocol/data/image.tif";

const toSafeLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getCogManagedIds = (layerId: string) => {
  const safeId = toSafeLayerId(layerId);
  return {
    sourceId: `${COG_LAYER_PREFIX}src-${safeId}`,
    layerId: `${COG_LAYER_PREFIX}${safeId}-raster`,
  };
};

const getCogArchiveUrl = (sourceUrl: string) => {
  if (sourceUrl === OFFICIAL_SAMPLE_COG_URL) {
    return sourceUrl;
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return sourceUrl;
  }

  if (typeof window === "undefined") {
    return sourceUrl;
  }

  return new URL(`${COG_PROXY_PATH}?url=${encodeURIComponent(sourceUrl)}`, window.location.origin).toString();
};

const getCogProtocolUrl = (archiveUrl: string) => `${COG_PROTOCOL_NAME}://${archiveUrl}`;

export const registerCogProtocol = () => {
  if (!cogProtocolRegistered) {
    maplibregl.addProtocol(COG_PROTOCOL_NAME, cogProtocol);
    cogProtocolRegistered = true;
  }
};

export const unregisterCogProtocol = () => {
  if (cogProtocolRegistered) {
    maplibregl.removeProtocol(COG_PROTOCOL_NAME);
    cogProtocolRegistered = false;
  }
};

export const isCogMapLibreLayer = (layer: Pick<GeoPlusLayerItem, "engine" | "serviceType">) =>
  layer.engine === "maplibre" && layer.serviceType === "cog";

export const syncCogMapLibreLayer = (args: {
  map: maplibregl.Map;
  layer: GeoPlusLayerItem;
  layerOpacity: number;
}) => {
  const { map, layer, layerOpacity } = args;
  const sourceUrl = layer.sourceUrl?.trim();
  if (!sourceUrl || !map.isStyleLoaded()) {
    return;
  }

  const archiveUrl = getCogArchiveUrl(sourceUrl);
  const protocolUrl = getCogProtocolUrl(archiveUrl);
  const { sourceId, layerId } = getCogManagedIds(layer.id);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      url: protocolUrl,
      tileSize: 256,
    });
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": layerOpacity,
      },
    });
  }
};
