import * as maplibregl from "maplibre-gl";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { isOpfsUrl, resolveLayerFileUrl } from "@/lib/geoplus/opfs-storage";

let cogProtocolRegistered = false;

const COG_PROTOCOL_NAME = "cog";
const COG_LAYER_PREFIX = "geoplus-user-cog-";
const COG_PROXY_PATH = "/api/geoplus/cog";
const OFFICIAL_SAMPLE_COG_URL = "https://labs.geomatico.es/maplibre-cog-protocol/data/image.tif";
const opfsBlobUrlCache = new Map<string, string>();

const toSafeLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getCogManagedIds = (layerId: string) => {
  const safeId = toSafeLayerId(layerId);
  return {
    sourceId: `${COG_LAYER_PREFIX}src-${safeId}`,
    layerId: `${COG_LAYER_PREFIX}${safeId}-raster`,
  };
};

const getCogArchiveUrl = async (sourceUrl: string) => {
  if (sourceUrl === OFFICIAL_SAMPLE_COG_URL) {
    return sourceUrl;
  }

  if (isOpfsUrl(sourceUrl)) {
    const cachedUrl = opfsBlobUrlCache.get(sourceUrl);
    if (cachedUrl) {
      return cachedUrl;
    }

    const file = await resolveLayerFileUrl(sourceUrl);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      opfsBlobUrlCache.set(sourceUrl, blobUrl);
      return blobUrl;
    }
  }

  if (sourceUrl.startsWith("blob:")) {
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

export const isCogMapLibreLayer = (
  layer: Pick<GeoPlusLayerItem, "engine" | "serviceType" | "sourceUrl" | "tilesetProfileId">,
) =>
  layer.engine === "maplibre" &&
  (layer.serviceType === "cog" ||
    layer.tilesetProfileId === "cog-raster-source" ||
    [".tif", ".tiff", ".cog"].some((suffix) => layer.sourceUrl?.toLowerCase().includes(suffix)));

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

  void (async () => {
    const archiveUrl = await getCogArchiveUrl(sourceUrl);
    const protocolUrl = getCogProtocolUrl(archiveUrl);
    const { sourceId, layerId } = getCogManagedIds(layer.id);

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        url: protocolUrl,
        // 512-px tiles match how most COG overviews are tiled and reduce
        // the number of requests; smaller tiles cause visible seam artifacts.
        tileSize: 512,
      });
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": layerOpacity,
          // Disable the cross-fade animation between tile zoom levels —
          // the animation causes horizontal banding artifacts while tiles load.
          "raster-fade-duration": 0,
          // Bilinear resampling prevents pixelation at non-integer zoom levels.
          "raster-resampling": "linear",
        },
      });
    } else {
      // Keep opacity in sync when the layer already exists.
      map.setPaintProperty(layerId, "raster-opacity", layerOpacity);
    }
  })().catch((error) => {
    console.error(`Failed to sync COG layer ${layer.name}:`, error);
  });
};
