import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTilesetDetectionSummary,
  getDefaultEngineForLayerType,
  getServiceTilesetProfile,
  resolveTilesetProfileId,
} from "./profiles.ts";

test("service profile maps mvt to deck+mvt", () => {
  const profile = getServiceTilesetProfile("mvt");
  assert.equal(profile.engine, "deck");
  assert.equal(profile.layerType, "mvt");
  assert.equal(profile.id, "mvt-vector-tile");
});

test("service profile maps xyz to deck+raster", () => {
  const profile = getServiceTilesetProfile("xyz");
  assert.equal(profile.engine, "deck");
  assert.equal(profile.layerType, "raster-tile");
  assert.equal(profile.visualizationFamily, "raster-tile");
});

test("service profile maps pmtiles to maplibre+mvt", () => {
  const profile = getServiceTilesetProfile("pmtiles");
  assert.equal(profile.engine, "maplibre");
  assert.equal(profile.layerType, "mvt");
  assert.equal(profile.visualizationFamily, "vector-tile");
});

test("service profile maps cog to maplibre+raster", () => {
  const profile = getServiceTilesetProfile("cog");
  assert.equal(profile.engine, "maplibre");
  assert.equal(profile.layerType, "raster-tile");
  assert.equal(profile.visualizationFamily, "raster-tile");
});

test("default engine uses deck for all layer types", () => {
  assert.equal(getDefaultEngineForLayerType("raster-tile"), "deck");
  assert.equal(getDefaultEngineForLayerType("wms"), "deck");
  assert.equal(getDefaultEngineForLayerType("mvt"), "deck");
});

test("profile resolution falls back from layerType when serviceType is absent", () => {
  const wmsProfileId = resolveTilesetProfileId({ layerType: "wms" });
  const mvtProfileId = resolveTilesetProfileId({ layerType: "mvt", sourceUrl: "https://x/y/z.pbf" });
  assert.equal(wmsProfileId, "wms-raster-image");
  assert.equal(mvtProfileId, "mvt-vector-tile");
});

test("profile resolution detects pmtiles from URL suffix", () => {
  const profileId = resolveTilesetProfileId({
    layerType: "mvt",
    sourceUrl: "https://example.com/archive.pmtiles",
  });
  assert.equal(profileId, "pmtiles-vector-tile");
});

test("detection summary includes profile id when available", () => {
  const summary = buildTilesetDetectionSummary({
    engine: "deck",
    layerType: "mvt",
    profileId: "mvt-vector-tile",
    confidence: "high",
  });
  assert.equal(summary, "deck · mvt · high · mvt-vector-tile");
});
