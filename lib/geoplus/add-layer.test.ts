import assert from "node:assert/strict";
import test from "node:test";

import { buildLayerFromAddDataInput } from "./add-layer.ts";
import { detectLayerPipeline, resolvePipeline, type GeoPlusAddDataMode } from "./layer-pipeline.ts";

const buildLayerForMode = (args: {
  mode: GeoPlusAddDataMode;
  fileName?: string;
  externalUrl?: string;
  serviceUrl?: string;
  gisText?: string;
  layerName?: string;
  serviceType?: "wms" | "wmts" | "wfs" | "xyz" | "tms" | "mvt" | "pmtiles" | "cog" | "mlt";
  existingLayerNames?: string[];
  selectedSampleLayerName?: string;
  parsedUploadLayer?: {
    layerType: "geojson" | "scatterplot" | "mvt" | "raster-tile" | "wms";
    inlineData?: unknown;
    sourceUrl?: string;
    uploadStorageUrl?: string;
    formatLabel: string;
    readyMessage: string;
    featureCountEstimate?: number;
  } | null;
  fileSizeBytes?: number;
  visible?: boolean;
}) => {
  const mode = args.mode;
  const fileName = args.fileName ?? "";
  const externalUrl = args.externalUrl ?? "";
  const serviceUrl = args.serviceUrl ?? "";
  const serviceType = args.serviceType ?? "wms";
  const detectedPipeline = detectLayerPipeline({
    mode,
    fileName,
    inputUrl: mode === "service" ? serviceUrl : externalUrl,
    serviceType,
  });
  const { engine: resolvedEngine, layerType: resolvedLayerType } = resolvePipeline({
    detected: detectedPipeline,
    rendererPreference: "deck",
    layerTypePreference: "auto",
  });

  return buildLayerFromAddDataInput({
    mode,
    layerName: args.layerName ?? "",
    fileName,
    fileSizeBytes: args.fileSizeBytes,
    externalUrl,
    serviceUrl,
    serviceType,
    gisText: args.gisText ?? "",
    selectedSampleLayerName: args.selectedSampleLayerName,
    existingLayers: (args.existingLayerNames ?? []).map((name) => ({ name })),
    parsedUploadLayer: args.parsedUploadLayer ?? null,
    detectedPipeline,
    resolvedLayerType,
    resolvedEngine,
    rendererPreference: "deck",
    layerTypePreference: "auto",
    visible: args.visible,
    now: 1700000000000,
    random: 0.123,
  });
};

test("builds URL-based layer with unique derived name", () => {
  const layer = buildLayerForMode({
    mode: "url",
    externalUrl: "https://example.com/data/cities.geojson",
    existingLayerNames: ["cities"],
  });

  assert.equal(layer.id, "1700000000000-123");
  assert.equal(layer.name, "cities 1");
  assert.equal(layer.sourceMode, "url");
  assert.equal(layer.sourceUrl, "https://example.com/data/cities.geojson");
  assert.equal(layer.layerType, "geojson");
  assert.equal(layer.engine, "maplibre");
});

test("builds paste-based layer from WKT geometry", () => {
  const layer = buildLayerForMode({
    mode: "gis-paste",
    gisText: "POINT (100 0)",
  });

  assert.equal(layer.sourceMode, "gis-paste");
  assert.equal(layer.name, "Pasted Data");
  assert.equal(layer.layerType, "geojson");
  assert.equal(layer.engine, "maplibre");
  assert.deepEqual(layer.inlineData, {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: [100, 0],
        },
      },
    ],
  });
});

test("builds upload-based layer using parsed upload metadata", () => {
  const layer = buildLayerForMode({
    mode: "upload",
    fileName: "roads.tilejson",
    fileSizeBytes: 32 * 1024 * 1024,
    parsedUploadLayer: {
      layerType: "mvt",
      sourceUrl: "https://tiles.example.com/{z}/{x}/{y}.pbf",
      uploadStorageUrl: "opfs://upload-123__roads.tilejson",
      formatLabel: "TileJSON",
      readyMessage: "TileJSON parsed and ready to add.",
      featureCountEstimate: 180_000,
    },
  });

  assert.equal(layer.sourceMode, "upload");
  assert.equal(layer.layerType, "mvt");
  assert.equal(layer.engine, "deck");
  assert.equal(layer.fileName, "roads.tilejson");
  assert.equal(layer.sourceUrl, "https://tiles.example.com/{z}/{x}/{y}.pbf");
  assert.equal(layer.uploadScale, "medium");
  assert.equal(layer.uploadStorageUrl, "opfs://upload-123__roads.tilejson");
  assert.equal(layer.detectionSummary?.includes("parsed TileJSON"), true);
  assert.equal(layer.detectionSummary?.includes("Medium upload"), true);
});

test("supports starting an uploaded layer hidden", () => {
  const layer = buildLayerForMode({
    mode: "upload",
    fileName: "parcels.gpkg",
    parsedUploadLayer: {
      layerType: "geojson",
      sourceUrl: "opfs://upload-456__parcels.gpkg",
      uploadStorageUrl: "opfs://upload-456__parcels.gpkg",
      formatLabel: "GeoPackage",
      readyMessage: "GeoPackage parsed and ready to add.",
      featureCountEstimate: 2,
      inlineData: {
        type: "FeatureCollection",
        features: [],
      },
    },
    visible: false,
  });

  assert.equal(layer.visible, false);
});

test("routes polygon uploads to maplibre native rendering", () => {
  const layer = buildLayerForMode({
    mode: "upload",
    fileName: "parcels.gpkg",
    fileSizeBytes: 18 * 1024 * 1024,
    parsedUploadLayer: {
      layerType: "geojson",
      sourceUrl: "opfs://upload-456__parcels.gpkg",
      uploadStorageUrl: "opfs://upload-456__parcels.gpkg",
      formatLabel: "GeoPackage",
      readyMessage: "GeoPackage parsed and ready to add.",
      featureCountEstimate: 45_000,
      inlineData: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Parcel 1" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
    },
  });

  assert.equal(layer.sourceMode, "upload");
  assert.equal(layer.layerType, "geojson");
  assert.equal(layer.engine, "maplibre");
  assert.equal(layer.uploadStorageUrl, "opfs://upload-456__parcels.gpkg");
});

test("routes point-only uploads to maplibre circle rendering", () => {
  const layer = buildLayerForMode({
    mode: "upload",
    fileName: "observations.csv",
    fileSizeBytes: 512 * 1024,
    parsedUploadLayer: {
      layerType: "scatterplot",
      uploadStorageUrl: "opfs://upload-789__observations.csv",
      formatLabel: "CSV",
      readyMessage: "CSV parsed and ready to add.",
      featureCountEstimate: 2,
      inlineData: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "A" },
            geometry: { type: "Point", coordinates: [100, 13] },
          },
          {
            type: "Feature",
            properties: { name: "B" },
            geometry: { type: "Point", coordinates: [101, 14] },
          },
        ],
      },
    },
  });

  assert.equal(layer.sourceMode, "upload");
  assert.equal(layer.layerType, "scatterplot");
  assert.equal(layer.engine, "maplibre");
  assert.equal(layer.uploadStorageUrl, "opfs://upload-789__observations.csv");
});

test("builds service-based layer with mapped wms profile", () => {
  const layer = buildLayerForMode({
    mode: "service",
    serviceType: "wms",
    serviceUrl: "https://maps.example.com/geoserver/wms",
    layerName: "Regional WMS",
  });

  assert.equal(layer.name, "Regional WMS");
  assert.equal(layer.sourceMode, "service");
  assert.equal(layer.serviceType, "wms");
  assert.equal(layer.layerType, "wms");
  assert.equal(layer.engine, "deck");
  assert.equal(layer.tilesetProfileId, "wms-raster-image");
});

test("builds URL-based pmtiles layer for maplibre", () => {
  const layer = buildLayerForMode({
    mode: "url",
    externalUrl: "https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles",
  });

  assert.equal(layer.layerType, "mvt");
  assert.equal(layer.engine, "maplibre");
  assert.equal(layer.tilesetProfileId, "pmtiles-vector-tile");
});

test("builds URL-based cog layer for maplibre", () => {
  const layer = buildLayerForMode({
    mode: "url",
    externalUrl: "https://labs.geomatico.es/maplibre-cog-protocol/data/image.tif",
  });

  assert.equal(layer.layerType, "raster-tile");
  assert.equal(layer.engine, "maplibre");
  assert.equal(layer.tilesetProfileId, "cog-raster-source");
});

test("service mode prefers sample layer name when provided", () => {
  const layer = buildLayerForMode({
    mode: "service",
    serviceType: "tms",
    serviceUrl: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    selectedSampleLayerName: "OpenTopoMap TMS",
    existingLayerNames: ["OpenTopoMap TMS"],
  });

  assert.equal(layer.name, "OpenTopoMap TMS 1");
  assert.equal(layer.engine, "deck");
  assert.equal(layer.layerType, "raster-tile");
});
