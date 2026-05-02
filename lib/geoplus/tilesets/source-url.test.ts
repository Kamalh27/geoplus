import assert from "node:assert/strict";
import test from "node:test";

import { buildWmsTemplateUrl, resolveTilesetSourceUrl } from "./source-url.ts";

test("buildWmsTemplateUrl appends GetMap params when missing", () => {
  const url = buildWmsTemplateUrl("https://example.com/geoserver/wms");
  assert.equal(url.includes("request=GetMap"), true);
  assert.equal(url.includes("bbox={bbox-epsg-3857}"), true);
});

test("buildWmsTemplateUrl preserves explicit bbox template", () => {
  const sourceUrl = "https://example.com/geoserver/wms?bbox={bbox-epsg-3857}";
  const url = buildWmsTemplateUrl(sourceUrl);
  assert.equal(url, sourceUrl);
});

test("resolveTilesetSourceUrl rewrites wms and preserves raster", () => {
  const wmsLayerUrl = resolveTilesetSourceUrl({
    id: "1",
    name: "WMS Layer",
    sourceMode: "service",
    engine: "deck",
    layerType: "wms",
    rendererPreference: "deck",
    layerTypePreference: "auto",
    sourceUrl: "https://example.com/wms",
    visible: true,
    opacity: 1,
    stylePreset: "emerald",
  });
  const rasterLayerUrl = resolveTilesetSourceUrl({
    id: "2",
    name: "Raster Layer",
    sourceMode: "service",
    engine: "deck",
    layerType: "raster-tile",
    rendererPreference: "deck",
    layerTypePreference: "auto",
    sourceUrl: "https://example.com/tiles/{z}/{x}/{y}.png",
    visible: true,
    opacity: 1,
    stylePreset: "emerald",
  });

  assert.equal(wmsLayerUrl?.includes("request=GetMap"), true);
  assert.equal(rasterLayerUrl, "https://example.com/tiles/{z}/{x}/{y}.png");
});
