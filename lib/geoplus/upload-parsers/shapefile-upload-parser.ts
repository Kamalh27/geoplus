import shp from "shpjs";

import type { UploadFileParser, ParsedUploadLayer } from "@/lib/geoplus/upload-parsers/types";

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

const normalizeShapefileResult = (value: unknown): ParsedUploadLayer[] => {
  const singleCollection = asFeatureCollection(value);
  if (singleCollection) {
    return [
      {
        formatLabel: "Shapefile",
        layerType: inferLayerType(singleCollection),
        inlineData: singleCollection,
        readyMessage: "Shapefile parsed and ready to add.",
      }
    ];
  }

  if (!Array.isArray(value)) {
    throw new Error("Shapefile ZIP did not contain a valid feature layer.");
  }

  const parsedLayers: ParsedUploadLayer[] = [];

  for (const layer of value) {
    const collection = asFeatureCollection(layer);
    if (!collection || collection.features.length === 0) {
      continue;
    }

    const sourceLayerName = typeof (layer as { fileName?: unknown }).fileName === "string" ? (layer as { fileName: string }).fileName : "Shapefile";
    
    // Still assign source_layer property just in case it's helpful
    for (const feature of collection.features) {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      if (sourceLayerName && !Object.prototype.hasOwnProperty.call(properties, "source_layer")) {
        properties.source_layer = sourceLayerName;
      }
      feature.properties = properties;
    }

    parsedLayers.push({
      layerName: sourceLayerName,
      formatLabel: "Shapefile",
      layerType: inferLayerType(collection),
      inlineData: collection,
      readyMessage: `Shapefile layer "${sourceLayerName}" parsed and ready to add.`,
    });
  }

  if (parsedLayers.length === 0) {
    throw new Error("No features found in shapefile ZIP.");
  }

  return parsedLayers;
};

export const parseShapefileUpload: UploadFileParser = async (file) => {
  if (file.name.toLowerCase().endsWith(".shp")) {
    throw new Error("A standalone .shp file is not sufficient. Please upload a .zip archive containing the .shp, .shx, .dbf, and .prj files.");
  }

  const parsed = await shp(await file.arrayBuffer());
  return normalizeShapefileResult(parsed);
};
