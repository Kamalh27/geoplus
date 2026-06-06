import assert from "node:assert/strict";
import test from "node:test";

import { requiresDashboardLayerHydration } from "./dashboard-hydration.ts";

test("requiresDashboardLayerHydration keeps upload-backed layers eligible for local OPFS restore", () => {
  assert.equal(
    requiresDashboardLayerHydration({
      id: "layer-1",
      name: "Local upload",
      sourceMode: "upload",
      engine: "deck",
      layerType: "geojson",
      rendererPreference: "deck",
      layerTypePreference: "auto",
      uploadStorageUrl: "opfs://upload-123__local.geojson",
      visible: true,
      opacity: 1,
      stylePreset: "emerald",
    }),
    true,
  );
});

test("requiresDashboardLayerHydration ignores upload layers that already have inline data", () => {
  assert.equal(
    requiresDashboardLayerHydration({
      id: "layer-2",
      name: "Hydrated upload",
      sourceMode: "upload",
      engine: "deck",
      layerType: "geojson",
      rendererPreference: "deck",
      layerTypePreference: "auto",
      uploadStorageUrl: "opfs://upload-123__hydrated.geojson",
      inlineData: { type: "FeatureCollection", features: [] },
      visible: true,
      opacity: 1,
      stylePreset: "emerald",
    }),
    false,
  );
});
