import type {
  GeoPlusLayerEngine,
  GeoPlusLayerSourceMode,
  GeoPlusLayerType,
  GeoPlusLayerTypePreference,
  GeoPlusRendererPreference,
  GeoPlusServiceType,
} from "@/components/geoplus/types";
import { getDefaultEngineForLayerType, getServiceTilesetProfile } from "./tilesets/profiles.ts";

export type GeoPlusAddDataMode = GeoPlusLayerSourceMode | "existing-layers";
export type DetectionConfidence = "high" | "medium" | "low";

export type LayerPipelineDetection = {
  engine: GeoPlusLayerEngine;
  layerType: GeoPlusLayerType;
  confidence: DetectionConfidence;
  reason: string;
};

export const serviceOptions: GeoPlusServiceType[] = ["wms", "wmts", "wfs", "xyz", "tms", "mvt", "pmtiles", "cog", "mlt"];

export const serviceUrlPlaceholders: Record<GeoPlusServiceType, string> = {
  wms: "https://example.com/geoserver/wms?layers=workspace:layer_name",
  wmts:
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2015-06-07/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
  wfs: "https://example.com/geoserver/wfs",
  xyz: "https://example.com/tiles/{z}/{x}/{y}.png",
  tms: "https://example.com/tiles/{z}/{x}/{y}.png",
  mvt: "https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt",
  pmtiles: "https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles",
  cog: "https://labs.geomatico.es/maplibre-cog-protocol/data/image.tif",
  mlt: "https://example.com/tiles/{z}/{x}/{y}.mlt",
};

export const rendererOptions: { id: GeoPlusRendererPreference; label: string }[] = [
  { id: "deck", label: "Deck.gl" },
];

export const layerTypeOptions: { id: GeoPlusLayerTypePreference; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "geojson", label: "GeoJSON" },
  { id: "scatterplot", label: "Point" },
  { id: "mvt", label: "MVT" },
  { id: "raster-tile", label: "Raster Tile" },
  { id: "wms", label: "WMS" },
];

const getFileExtension = (value: string) => {
  const cleanValue = value.split("?")[0]?.split("#")[0] ?? "";
  const extension = cleanValue.split(".").pop()?.toLowerCase();
  return extension ?? "";
};

const looksLikeTileTemplate = (value: string) => value.includes("{z}") && value.includes("{x}") && value.includes("{y}");

export const detectLayerPipeline = (args: {
  mode: GeoPlusAddDataMode;
  fileName: string;
  inputUrl: string;
  serviceType: GeoPlusServiceType;
}): LayerPipelineDetection => {
  const { mode, fileName, inputUrl, serviceType } = args;
  const normalizedUrl = inputUrl.trim().toLowerCase();
  const fileExtension = getFileExtension(fileName);
  const urlExtension = getFileExtension(normalizedUrl);

  if (mode === "service") {
    const profile = getServiceTilesetProfile(serviceType);
    return {
      engine: profile.engine,
      layerType: profile.layerType,
      confidence: profile.confidence,
      reason: profile.reason,
    };
  }

  if (mode === "url") {
    if (normalizedUrl.includes("service=wms") || normalizedUrl.includes("request=getmap")) {
      return {
        engine: "deck",
        layerType: "wms",
        confidence: "high",
        reason: "WMS query parameters detected.",
      };
    }
    if (normalizedUrl.endsWith(".pmtiles")) {
      return {
        engine: "maplibre",
        layerType: "mvt",
        confidence: "high",
        reason: "PMTiles archive detected.",
      };
    }
    if (looksLikeTileTemplate(normalizedUrl) && ["mvt", "pbf", "mlt"].includes(urlExtension)) {
      return {
        engine: "deck",
        layerType: "mvt",
        confidence: "high",
        reason: "Vector tile URL template detected.",
      };
    }
    if (looksLikeTileTemplate(normalizedUrl) && ["png", "jpg", "jpeg", "webp"].includes(urlExtension)) {
      return {
        engine: "deck",
        layerType: "raster-tile",
        confidence: "high",
        reason: "Raster tile URL template detected.",
      };
    }
    if (["tif", "tiff", "cog"].includes(urlExtension)) {
      return {
        engine: "maplibre",
        layerType: "raster-tile",
        confidence: "medium",
        reason: "COG-compatible raster URL detected.",
      };
    }
    if (["geojson", "json"].includes(urlExtension)) {
      return {
        engine: "deck",
        layerType: "geojson",
        confidence: "high",
        reason: "GeoJSON endpoint detected.",
      };
    }
    if (["csv", "tsv", "parquet"].includes(urlExtension)) {
      return {
        engine: "deck",
        layerType: "scatterplot",
        confidence: "medium",
        reason: "Tabular dataset detected; suitable for point visualization.",
      };
    }
    return {
      engine: "deck",
      layerType: "geojson",
      confidence: "low",
      reason: "Unknown URL format, using Deck vector fallback.",
    };
  }

  if (mode === "gis-paste") {
    return {
      engine: "deck",
      layerType: "geojson",
      confidence: "high",
      reason: "Pasted feature data is best as GeoJSON.",
    };
  }

  if (mode === "upload") {
    if (["geojson", "json"].includes(fileExtension)) {
      return {
        engine: "deck",
        layerType: "geojson",
        confidence: "high",
        reason: "GeoJSON file detected.",
      };
    }
    if (["zip", "shp", "gpkg", "geopackage"].includes(fileExtension)) {
      return {
        engine: "deck",
        layerType: "geojson",
        confidence: "medium",
        reason: "Vector feature file detected.",
      };
    }
    if (["tilejson"].includes(fileExtension)) {
      return {
        engine: "deck",
        layerType: "mvt",
        confidence: "low",
        reason: "TileJSON file detected.",
      };
    }
    if (["csv", "tsv", "parquet"].includes(fileExtension)) {
      return {
        engine: "deck",
        layerType: "scatterplot",
        confidence: "medium",
        reason: "Tabular file detected.",
      };
    }
    if (["mvt", "pbf", "pmtiles", "mlt"].includes(fileExtension)) {
      return {
        engine: fileExtension === "pmtiles" ? "maplibre" : "deck",
        layerType: "mvt",
        confidence: "medium",
        reason: fileExtension === "pmtiles" ? "PMTiles archive detected." : "Vector tile file detected.",
      };
    }
    if (["tif", "tiff", "cog"].includes(fileExtension)) {
      return {
        engine: "maplibre",
        layerType: "raster-tile",
        confidence: "medium",
        reason: "COG-compatible raster file detected.",
      };
    }
  }

  return {
    engine: "deck",
    layerType: "geojson",
    confidence: "low",
    reason: "Fallback pipeline selected.",
  };
};

export const resolvePipeline = (args: {
  detected: LayerPipelineDetection;
  rendererPreference: GeoPlusRendererPreference;
  layerTypePreference: GeoPlusLayerTypePreference;
}) => {
  const { detected, rendererPreference, layerTypePreference } = args;
  void rendererPreference;
  const resolvedLayerType = layerTypePreference === "auto" ? detected.layerType : layerTypePreference;
  const resolvedEngine = layerTypePreference === "auto" ? detected.engine : getDefaultEngineForLayerType(resolvedLayerType);
  return {
    engine: resolvedEngine,
    layerType: resolvedLayerType,
  };
};

export const toLayerSourceMode = (mode: GeoPlusAddDataMode): GeoPlusLayerSourceMode =>
  mode === "existing-layers" ? "url" : mode;
