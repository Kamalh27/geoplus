import type { GeoPlusLayerEngine, GeoPlusLayerType, GeoPlusServiceType } from "@/components/geoplus/types";

export type GeoPlusTilesetConfidence = "high" | "medium" | "low";
export type GeoPlusTilesetVisualizationFamily = "vector-tile" | "raster-tile" | "feature-service";

export type GeoPlusTilesetProfile = {
  id: string;
  label: string;
  serviceType: GeoPlusServiceType;
  engine: GeoPlusLayerEngine;
  layerType: GeoPlusLayerType;
  confidence: GeoPlusTilesetConfidence;
  reason: string;
  visualizationFamily: GeoPlusTilesetVisualizationFamily;
};

const SERVICE_TILESET_PROFILES: Record<GeoPlusServiceType, GeoPlusTilesetProfile> = {
  wms: {
    id: "wms-raster-image",
    label: "WMS Raster Image",
    serviceType: "wms",
    engine: "deck",
    layerType: "wms",
    confidence: "high",
    reason: "WMS sources are rendered with Deck.gl image layers.",
    visualizationFamily: "raster-tile",
  },
  wmts: {
    id: "wmts-raster-tile",
    label: "WMTS Raster Tile",
    serviceType: "wmts",
    engine: "deck",
    layerType: "raster-tile",
    confidence: "high",
    reason: "WMTS services are rendered with Deck.gl raster tile layers.",
    visualizationFamily: "raster-tile",
  },
  xyz: {
    id: "xyz-raster-tile",
    label: "XYZ Raster Tile",
    serviceType: "xyz",
    engine: "deck",
    layerType: "raster-tile",
    confidence: "high",
    reason: "XYZ URL templates map directly to Deck.gl raster tile layers.",
    visualizationFamily: "raster-tile",
  },
  tms: {
    id: "tms-raster-tile",
    label: "TMS Raster Tile",
    serviceType: "tms",
    engine: "deck",
    layerType: "raster-tile",
    confidence: "high",
    reason: "TMS URL templates map directly to Deck.gl raster tile layers.",
    visualizationFamily: "raster-tile",
  },
  mvt: {
    id: "mvt-vector-tile",
    label: "MVT Vector Tile",
    serviceType: "mvt",
    engine: "deck",
    layerType: "mvt",
    confidence: "high",
    reason: "MVT endpoints are rendered with Deck.gl vector tile layers.",
    visualizationFamily: "vector-tile",
  },
  pmtiles: {
    id: "pmtiles-vector-tile",
    label: "PMTiles Vector Tile",
    serviceType: "pmtiles",
    engine: "maplibre",
    layerType: "mvt",
    confidence: "high",
    reason: "PMTiles archives are rendered through the MapLibre PMTiles protocol.",
    visualizationFamily: "vector-tile",
  },
  mlt: {
    id: "mlt-vector-tile",
    label: "MLT Vector Tile",
    serviceType: "mlt",
    engine: "deck",
    layerType: "mvt",
    confidence: "medium",
    reason: "MLT tile streams are rendered through the vector tile pipeline.",
    visualizationFamily: "vector-tile",
  },
  wfs: {
    id: "wfs-feature-service",
    label: "WFS Feature Service",
    serviceType: "wfs",
    engine: "deck",
    layerType: "geojson",
    confidence: "medium",
    reason: "WFS services are feature-oriented and best handled as vectors.",
    visualizationFamily: "feature-service",
  },
  cog: {
    id: "cog-raster-source",
    label: "COG Raster Source",
    serviceType: "cog",
    engine: "maplibre",
    layerType: "raster-tile",
    confidence: "high",
    reason: "COG sources are rendered through the MapLibre COG protocol.",
    visualizationFamily: "raster-tile",
  },
  mbtiles: {
    id: "mbtiles-vector-tile",
    label: "MBTiles Vector Tile",
    serviceType: "mbtiles",
    engine: "maplibre",
    layerType: "mvt",
    confidence: "high",
    reason: "MBTiles archives are rendered through a custom MapLibre protocol.",
    visualizationFamily: "vector-tile",
  },
};

export const getServiceTilesetProfile = (serviceType: GeoPlusServiceType) => SERVICE_TILESET_PROFILES[serviceType];

export const getDefaultEngineForLayerType = (layerType: GeoPlusLayerType): GeoPlusLayerEngine => {
  void layerType;
  return "deck";
};

export const resolveTilesetProfileId = (args: {
  serviceType?: GeoPlusServiceType;
  layerType: GeoPlusLayerType;
  sourceUrl?: string;
}) => {
  const { serviceType, layerType, sourceUrl } = args;
  if (serviceType) {
    return getServiceTilesetProfile(serviceType).id;
  }
  if (layerType === "wms") {
    return SERVICE_TILESET_PROFILES.wms.id;
  }
  if (layerType === "mvt") {
    if (sourceUrl?.toLowerCase().includes(".pmtiles")) {
      return SERVICE_TILESET_PROFILES.pmtiles.id;
    }
    return SERVICE_TILESET_PROFILES.mvt.id;
  }
  if (layerType === "raster-tile") {
    if (sourceUrl && [".tif", ".tiff", ".cog"].some((suffix) => sourceUrl.toLowerCase().includes(suffix))) {
      return SERVICE_TILESET_PROFILES.cog.id;
    }
    return SERVICE_TILESET_PROFILES.xyz.id;
  }
  return null;
};

export const buildTilesetDetectionSummary = (args: {
  engine: GeoPlusLayerEngine;
  layerType: GeoPlusLayerType;
  profileId: string | null;
  confidence: GeoPlusTilesetConfidence;
}) => {
  const { engine, layerType, profileId, confidence } = args;
  if (!profileId) {
    return `${engine} · ${layerType} · ${confidence}`;
  }
  return `${engine} · ${layerType} · ${confidence} · ${profileId}`;
};
