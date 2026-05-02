import { convertWKTToGeometry } from "@loaders.gl/gis";

import type {
  GeoPlusLayerEngine,
  GeoPlusLayerItem,
  GeoPlusLayerType,
  GeoPlusLayerTypePreference,
  GeoPlusRendererPreference,
  GeoPlusServiceType,
} from "@/components/geoplus/types";
import type { LayerPipelineDetection, GeoPlusAddDataMode } from "./layer-pipeline.ts";
import { toLayerSourceMode } from "./layer-pipeline.ts";
import { buildTilesetDetectionSummary, resolveTilesetProfileId } from "./tilesets/profiles.ts";
import type { ParsedUploadLayer } from "./upload-parsers/index.ts";

const stripExtension = (value: string) => value.replace(/\.[^./\\]+$/, "");

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const isGeoJsonType = (value: unknown) =>
  typeof value === "string" &&
  [
    "FeatureCollection",
    "Feature",
    "GeometryCollection",
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
  ].includes(value);

const toSingleFeatureCollection = (geometry: GeoJSON.Geometry): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry,
    },
  ],
});

const toGeoJsonFeatureCollection = (value: unknown): GeoJSON.FeatureCollection | null => {
  if (Array.isArray(value)) {
    const allFeatures = value.every((entry) => asRecord(entry)?.type === "Feature");
    if (!allFeatures) {
      return null;
    }
    return {
      type: "FeatureCollection",
      features: value as GeoJSON.Feature[],
    };
  }

  const record = asRecord(value);
  if (!record || !isGeoJsonType(record.type)) {
    return null;
  }

  if (record.type === "FeatureCollection") {
    return Array.isArray(record.features) ? (record as unknown as GeoJSON.FeatureCollection) : null;
  }
  if (record.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [record as unknown as GeoJSON.Feature],
    };
  }

  return toSingleFeatureCollection(record as unknown as GeoJSON.Geometry);
};

export const parseGisPasteInput = (value: string): GeoJSON.FeatureCollection => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Paste valid GeoJSON JSON or WKT geometry before adding a layer.");
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const featureCollection = toGeoJsonFeatureCollection(parsed);
    if (featureCollection) {
      return featureCollection;
    }
  } catch {
    // Fall through to WKT parsing.
  }

  try {
    const geometry = convertWKTToGeometry(trimmed) as GeoJSON.Geometry;
    return toSingleFeatureCollection(geometry);
  } catch {
    throw new Error("Paste valid GeoJSON JSON or WKT geometry before adding a layer.");
  }
};

const buildUniqueAutoName = (rawName: string, existingLayers: Pick<GeoPlusLayerItem, "name">[]) => {
  const baseName = rawName.trim() || "Layer";
  const existingNames = new Set(existingLayers.map((layer) => layer.name.trim().toLowerCase()).filter(Boolean));
  const normalizedBaseName = baseName.toLowerCase();
  if (!existingNames.has(normalizedBaseName)) {
    return baseName;
  }

  let suffix = 1;
  let nextName = `${baseName} ${suffix}`;
  while (existingNames.has(nextName.toLowerCase())) {
    suffix += 1;
    nextName = `${baseName} ${suffix}`;
  }
  return nextName;
};

const deriveNameFromUrl = (value: string, fallbackName: string) => {
  try {
    const parsed = new URL(value.trim());
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const candidate = decodeURIComponent(pathParts.at(-1) ?? "");
    if (candidate) {
      const withoutExtension = stripExtension(candidate).trim();
      return withoutExtension || fallbackName;
    }
    return parsed.hostname || fallbackName;
  } catch {
    return fallbackName;
  }
};

const deriveLayerName = (args: {
  mode: GeoPlusAddDataMode;
  layerName: string;
  fileName: string;
  externalUrl: string;
  serviceUrl: string;
  serviceType: GeoPlusServiceType;
  selectedSampleLayerName?: string | null;
  existingLayers: Pick<GeoPlusLayerItem, "name">[];
}) => {
  const {
    mode,
    layerName,
    fileName,
    externalUrl,
    serviceUrl,
    serviceType,
    selectedSampleLayerName,
    existingLayers,
  } = args;
  const customName = layerName.trim();
  if (customName) {
    return customName;
  }

  if (mode === "upload") {
    return buildUniqueAutoName(stripExtension(fileName) || "Layer", existingLayers);
  }
  if (mode === "url") {
    return buildUniqueAutoName(deriveNameFromUrl(externalUrl, "Layer"), existingLayers);
  }
  if (mode === "service") {
    if (selectedSampleLayerName?.trim()) {
      return buildUniqueAutoName(selectedSampleLayerName, existingLayers);
    }
    return buildUniqueAutoName(deriveNameFromUrl(serviceUrl, serviceType.toUpperCase()), existingLayers);
  }
  if (mode === "gis-paste") {
    return buildUniqueAutoName("Pasted Data", existingLayers);
  }
  return buildUniqueAutoName(selectedSampleLayerName ?? "Layer", existingLayers);
};

export const buildLayerFromAddDataInput = (args: {
  mode: GeoPlusAddDataMode;
  layerName: string;
  fileName: string;
  externalUrl: string;
  serviceUrl: string;
  serviceType: GeoPlusServiceType;
  gisText: string;
  selectedSampleLayerName?: string | null;
  existingLayers: Pick<GeoPlusLayerItem, "name">[];
  parsedUploadLayer: ParsedUploadLayer | null;
  detectedPipeline: LayerPipelineDetection;
  resolvedLayerType: GeoPlusLayerType;
  resolvedEngine: GeoPlusLayerEngine;
  rendererPreference: GeoPlusRendererPreference;
  layerTypePreference: GeoPlusLayerTypePreference;
  now?: number;
  random?: number;
}): GeoPlusLayerItem => {
  const {
    mode,
    fileName,
    externalUrl,
    serviceUrl,
    serviceType,
    gisText,
    selectedSampleLayerName,
    existingLayers,
    parsedUploadLayer,
    detectedPipeline,
    resolvedLayerType,
    resolvedEngine,
    rendererPreference,
    layerTypePreference,
    now = Date.now(),
    random = Math.random(),
  } = args;

  let inlineData: unknown = undefined;
  let uploadLayerType: GeoPlusLayerType | null = null;
  let uploadSourceUrl: string | undefined = undefined;
  if (mode === "upload") {
    if (!parsedUploadLayer) {
      throw new Error("Choose a valid supported file before adding the layer.");
    }
    inlineData = parsedUploadLayer.inlineData;
    uploadLayerType = parsedUploadLayer.layerType;
    uploadSourceUrl = parsedUploadLayer.sourceUrl;
  } else if (mode === "gis-paste") {
    inlineData = parseGisPasteInput(gisText);
  }

  const finalLayerType = uploadLayerType ?? resolvedLayerType;
  const finalEngine = mode === "service" || mode === "url" ? resolvedEngine : "deck";
  const sourceUrl =
    mode === "upload"
      ? uploadSourceUrl
      : mode === "url"
        ? externalUrl.trim()
        : mode === "service"
          ? serviceUrl.trim()
          : undefined;
  const sourceMode = toLayerSourceMode(mode);
  const tilesetProfileId = resolveTilesetProfileId({
    serviceType: mode === "service" ? serviceType : undefined,
    layerType: finalLayerType,
    sourceUrl,
  });
  const detectionSummary = buildTilesetDetectionSummary({
    engine: finalEngine,
    layerType: finalLayerType,
    profileId: tilesetProfileId,
    confidence: detectedPipeline.confidence,
  });

  return {
    id: `${now}-${Math.round(random * 1000)}`,
    name: deriveLayerName({
      mode,
      layerName: args.layerName,
      fileName,
      externalUrl,
      serviceUrl,
      serviceType,
      selectedSampleLayerName,
      existingLayers,
    }),
    sourceMode,
    engine: finalEngine,
    layerType: finalLayerType,
    tilesetProfileId: tilesetProfileId ?? undefined,
    rendererPreference,
    layerTypePreference,
    sourceUrl,
    serviceType: mode === "service" ? serviceType : undefined,
    fileName: mode === "upload" ? fileName : undefined,
    inlineData,
    detectionSummary:
      mode === "upload" && parsedUploadLayer
        ? `${detectionSummary} · parsed ${parsedUploadLayer.formatLabel}`
        : detectionSummary,
    visible: true,
    opacity: 1,
    stylePreset: "emerald",
    styleConfig: undefined,
    labelEnabled: false,
    labelField: undefined,
  };
};
