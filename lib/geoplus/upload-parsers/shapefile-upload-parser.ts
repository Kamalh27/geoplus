import shp from "shpjs";

import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

type FeatureCollection = GeoJSON.FeatureCollection;

const asFeatureCollection = (value: unknown): FeatureCollection | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.type !== "FeatureCollection" || !Array.isArray(record.features)) {
    return null;
  }

  return record as unknown as FeatureCollection;
};

const inferLayerType = (featureCollection: FeatureCollection) => {
  const hasOnlyPoints = featureCollection.features.every((feature) => feature.geometry?.type === "Point");
  return hasOnlyPoints ? "scatterplot" : "geojson";
};

const normalizeShapefileResult = (value: unknown): FeatureCollection => {
  const singleCollection = asFeatureCollection(value);
  if (singleCollection) {
    return singleCollection;
  }

  if (!Array.isArray(value)) {
    throw new Error("Shapefile ZIP did not contain a valid feature layer.");
  }

  const mergedFeatures: GeoJSON.Feature[] = [];

  for (const layer of value) {
    const collection = asFeatureCollection(layer);
    if (!collection) {
      continue;
    }

    const sourceLayerName = typeof (layer as { fileName?: unknown }).fileName === "string" ? (layer as { fileName: string }).fileName : null;
    for (const feature of collection.features) {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      if (sourceLayerName && !Object.prototype.hasOwnProperty.call(properties, "source_layer")) {
        properties.source_layer = sourceLayerName;
      }
      mergedFeatures.push({
        ...feature,
        properties,
      });
    }
  }

  if (mergedFeatures.length === 0) {
    throw new Error("No features found in shapefile ZIP.");
  }

  return {
    type: "FeatureCollection",
    features: mergedFeatures,
  };
};

export const parseShapefileUpload: UploadFileParser = async (file) => {
  const parsed = await shp(await file.arrayBuffer());
  const featureCollection = normalizeShapefileResult(parsed);

  return {
    formatLabel: "Shapefile",
    layerType: inferLayerType(featureCollection),
    inlineData: featureCollection,
    readyMessage: "Shapefile parsed and ready to add.",
  };
};
