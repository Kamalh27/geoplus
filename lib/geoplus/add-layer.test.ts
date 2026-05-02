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
    formatLabel: string;
    readyMessage: string;
  } | null;
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
  assert.equal(layer.engine, "deck");
});

test("builds paste-based layer from WKT geometry", () => {
  const layer = buildLayerForMode({
    mode: "gis-paste",
    gisText: "POINT (100 0)",
  });

  assert.equal(layer.sourceMode, "gis-paste");
  assert.equal(layer.name, "Pasted Data");
  assert.equal(layer.layerType, "geojson");
  assert.equal(layer.engine, "deck");
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
    parsedUploadLayer: {
      layerType: "mvt",
      sourceUrl: "https://tiles.example.com/{z}/{x}/{y}.pbf",
      formatLabel: "TileJSON",
      readyMessage: "TileJSON parsed and ready to add.",
    },
  });

  assert.equal(layer.sourceMode, "upload");
  assert.equal(layer.layerType, "mvt");
  assert.equal(layer.engine, "deck");
  assert.equal(layer.fileName, "roads.tilejson");
  assert.equal(layer.sourceUrl, "https://tiles.example.com/{z}/{x}/{y}.pbf");
  assert.equal(layer.detectionSummary?.includes("parsed TileJSON"), true);
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
