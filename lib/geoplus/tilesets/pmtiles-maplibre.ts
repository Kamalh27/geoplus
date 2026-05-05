import maplibregl from "maplibre-gl";
import { PMTiles, Protocol, TileType } from "pmtiles";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";

type LayerStyleColors = {
  fill: [number, number, number];
  line: [number, number, number];
  point: [number, number, number];
};

type PmtilesTileJson = {
  attribution?: string;
  minzoom?: number;
  maxzoom?: number;
  bounds?: [number, number, number, number];
  vector_layers?: Array<{ id?: string }> | string;
};

type PmtilesHeaderLike = {
  tileType?: TileType;
  minZoom?: number;
  maxZoom?: number;
  minLon?: number;
  minLat?: number;
  maxLon?: number;
  maxLat?: number;
};

let pmtilesProtocol: Protocol | null = null;
let protocolRegistered = false;

const PMTILES_PROTOCOL_NAME = "pmtiles";
const PMTILES_LAYER_PREFIX = "geoplus-user-pmtiles-";
const PMTILES_PROXY_PATH = "/api/geoplus/pmtiles";
const OFFICIAL_SAMPLE_PMTILES_URL =
  "https://r2-public.protomaps.com/protomaps-sample-datasets/cb_2018_us_zcta510_500k.pmtiles";
const RASTER_SAMPLE_PMTILES_URL = "https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles";

const toSafeLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getPmtilesManagedIds = (layerId: string) => {
  const safeId = toSafeLayerId(layerId);
  return {
    sourceId: `${PMTILES_LAYER_PREFIX}src-${safeId}`,
    layerPrefix: `${PMTILES_LAYER_PREFIX}${safeId}`,
  };
};

const asPmtilesTileJson = (value: unknown): PmtilesTileJson => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as PmtilesTileJson;
};

const asPmtilesHeader = (value: unknown): PmtilesHeaderLike => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as PmtilesHeaderLike;
};

const ensurePmtilesProtocol = () => {
  if (!pmtilesProtocol) {
    pmtilesProtocol = new Protocol({ metadata: true });
  }
  if (!protocolRegistered) {
    maplibregl.addProtocol(PMTILES_PROTOCOL_NAME, pmtilesProtocol.tile);
    protocolRegistered = true;
  }
  return pmtilesProtocol;
};

export const registerPmtilesProtocol = () => {
  ensurePmtilesProtocol();
};

export const unregisterPmtilesProtocol = () => {
  if (protocolRegistered) {
    maplibregl.removeProtocol(PMTILES_PROTOCOL_NAME);
    protocolRegistered = false;
  }
};

const getPmtilesArchiveUrl = (sourceUrl: string) => {
  if (sourceUrl === OFFICIAL_SAMPLE_PMTILES_URL || sourceUrl === RASTER_SAMPLE_PMTILES_URL) {
    return sourceUrl;
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

  return new URL(
    `${PMTILES_PROXY_PATH}?url=${encodeURIComponent(sourceUrl)}`,
    window.location.origin,
  ).toString();
};

const getPmtilesProtocolUrl = (archiveUrl: string) => `${PMTILES_PROTOCOL_NAME}://${archiveUrl}`;

const getPmtilesInstance = (archiveUrl: string) => {
  const protocol = ensurePmtilesProtocol();
  let instance = protocol.get(archiveUrl);
  if (!instance) {
    instance = new PMTiles(archiveUrl);
    protocol.add(instance);
  }
  return instance;
};

const getFallbackSourceLayerIds = (sourceUrl: string) => {
  if (sourceUrl.includes("cb_2018_us_zcta510_500k.pmtiles")) {
    return ["zcta"];
  }
  return [];
};

const createOfficialSampleStyleLayers = (args: {
  layerPrefix: string;
  sourceId: string;
  layerOpacity: number;
}) =>
  [
    {
      id: `${args.layerPrefix}-zcta`,
      type: "line",
      source: args.sourceId,
      "source-layer": "zcta",
      paint: {
        "line-color": "#999999",
        "line-opacity": args.layerOpacity,
      },
    },
  ] satisfies maplibregl.AddLayerObject[];

const createRasterStyleLayers = (args: {
  layerPrefix: string;
  sourceId: string;
  layerOpacity: number;
}) =>
  [
    {
      id: `${args.layerPrefix}-raster`,
      type: "raster",
      source: args.sourceId,
      paint: {
        "raster-opacity": args.layerOpacity,
      },
    },
  ] satisfies maplibregl.AddLayerObject[];

const getPmtilesSourceLayerIds = (tileJson: PmtilesTileJson, sourceUrl: string) => {
  let vectorLayers: Array<{ id?: string }> = [];

  if (Array.isArray(tileJson.vector_layers)) {
    vectorLayers = tileJson.vector_layers;
  } else if (typeof tileJson.vector_layers === "string") {
    try {
      const parsedValue = JSON.parse(tileJson.vector_layers) as unknown;
      if (Array.isArray(parsedValue)) {
        vectorLayers = parsedValue.filter(
          (value): value is { id?: string } => Boolean(value) && typeof value === "object",
        );
      }
    } catch {
      // Some archives store vector_layers in metadata as a string. If parsing fails,
      // we will fall back to any known layer ids for that archive.
    }
  }

  const ids = vectorLayers
    .map((layer) => layer?.id?.trim())
    .filter((value): value is string => Boolean(value));

  if (ids.length > 0) {
    return ids;
  }

  return getFallbackSourceLayerIds(sourceUrl);
};

const createPmtilesStyleLayers = (args: {
  layerPrefix: string;
  sourceId: string;
  sourceLayerIds: string[];
  layerOpacity: number;
  styleColors: LayerStyleColors;
  sourceUrl: string;
}) => {
  const { layerPrefix, sourceId, sourceLayerIds, layerOpacity, styleColors, sourceUrl } = args;
  if (sourceUrl === OFFICIAL_SAMPLE_PMTILES_URL) {
    return createOfficialSampleStyleLayers({
      layerPrefix,
      sourceId,
      layerOpacity,
    });
  }

  const styleLayers: maplibregl.AddLayerObject[] = [];

  for (const sourceLayerId of sourceLayerIds) {
    const safeSourceLayerId = toSafeLayerId(sourceLayerId);
    styleLayers.push({
      id: `${layerPrefix}-${safeSourceLayerId}-fill`,
      type: "fill",
      source: sourceId,
      "source-layer": sourceLayerId,
      paint: {
        "fill-color": `rgb(${styleColors.fill[0]}, ${styleColors.fill[1]}, ${styleColors.fill[2]})`,
        "fill-opacity": 0.18 * layerOpacity,
      },
    });
    styleLayers.push({
      id: `${layerPrefix}-${safeSourceLayerId}-line`,
      type: "line",
      source: sourceId,
      "source-layer": sourceLayerId,
      paint: {
        "line-color": `rgb(${styleColors.line[0]}, ${styleColors.line[1]}, ${styleColors.line[2]})`,
        "line-width": 1.6,
        "line-opacity": 0.9 * layerOpacity,
      },
    });
    styleLayers.push({
      id: `${layerPrefix}-${safeSourceLayerId}-circle`,
      type: "circle",
      source: sourceId,
      "source-layer": sourceLayerId,
      paint: {
        "circle-radius": 3.5,
        "circle-color": `rgb(${styleColors.point[0]}, ${styleColors.point[1]}, ${styleColors.point[2]})`,
        "circle-opacity": layerOpacity,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  return styleLayers;
};

export const isPmtilesMapLibreLayer = (layer: Pick<GeoPlusLayerItem, "engine" | "serviceType">) =>
  layer.engine === "maplibre" && layer.serviceType === "pmtiles";

export const syncPmtilesMapLibreLayer = async (args: {
  map: maplibregl.Map;
  layer: GeoPlusLayerItem;
  layerOpacity: number;
  styleColors: LayerStyleColors;
}) => {
  const { map, layer, layerOpacity, styleColors } = args;
  const sourceUrl = layer.sourceUrl?.trim();
  if (!sourceUrl) {
    return;
  }

  const archiveUrl = getPmtilesArchiveUrl(sourceUrl);
  const protocolUrl = getPmtilesProtocolUrl(archiveUrl);
  const { sourceId, layerPrefix } = getPmtilesManagedIds(layer.id);
  const instance = getPmtilesInstance(archiveUrl);
  const header = asPmtilesHeader(await instance.getHeader());
  const isRasterPmtiles =
    header.tileType === TileType.Png ||
    header.tileType === TileType.Jpeg ||
    header.tileType === TileType.Webp ||
    header.tileType === TileType.Avif;

  if (!map.isStyleLoaded()) {
    return;
  }

  if (isRasterPmtiles) {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        url: protocolUrl,
        bounds:
          typeof header.minLon === "number" &&
          typeof header.minLat === "number" &&
          typeof header.maxLon === "number" &&
          typeof header.maxLat === "number"
            ? [header.minLon, header.minLat, header.maxLon, header.maxLat]
            : undefined,
        minzoom: header.minZoom,
        maxzoom: header.maxZoom,
      });
    }

    for (const styleLayer of createRasterStyleLayers({
      layerPrefix,
      sourceId,
      layerOpacity,
    })) {
      if (!map.getLayer(styleLayer.id)) {
        map.addLayer(styleLayer);
      }
    }
    return;
  }

  let tileJson: PmtilesTileJson;
  try {
    tileJson = asPmtilesTileJson(await instance.getTileJson(protocolUrl));
  } catch (error) {
    console.warn(`Failed to load PMTiles metadata for ${sourceUrl}.`, error);
    return;
  }

  const sourceLayerIds = getPmtilesSourceLayerIds(tileJson, sourceUrl);

  if (sourceLayerIds.length === 0) {
    return;
  }

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "vector",
      url: protocolUrl,
      attribution: tileJson.attribution,
      bounds: tileJson.bounds,
      minzoom: tileJson.minzoom,
      maxzoom: tileJson.maxzoom,
    });
  }

  for (const styleLayer of createPmtilesStyleLayers({
    layerPrefix,
    sourceId,
    sourceLayerIds,
    layerOpacity,
    styleColors,
    sourceUrl,
  })) {
    if (!map.getLayer(styleLayer.id)) {
      map.addLayer(styleLayer);
    }
  }
};
