import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardLayerFetchTargets, requiresDashboardLayerHydration } from "./dashboard-hydration.ts";

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

const CORE = "http://localhost:8010";

test("buildDashboardLayerFetchTargets sends core API paths through the proxy, never to core directly", () => {
  assert.deepEqual(buildDashboardLayerFetchTargets("/api/v1/layers/x/file?token=a", CORE), [
    { url: "/api/core/api/v1/layers/x/file?token=a", viaCoreProxy: true },
  ]);
  assert.deepEqual(buildDashboardLayerFetchTargets(`${CORE}/api/v1/layers/x/file`, CORE), [
    { url: "/api/core/api/v1/layers/x/file", viaCoreProxy: true },
  ]);
});

test("buildDashboardLayerFetchTargets keeps public dashboard files direct and credential-free", () => {
  assert.deepEqual(buildDashboardLayerFetchTargets("/static/uploads/dashboards/1/d/datasets/a.zip", CORE), [
    { url: `${CORE}/static/uploads/dashboards/1/d/datasets/a.zip`, viaCoreProxy: false },
  ]);
  assert.deepEqual(buildDashboardLayerFetchTargets("https://old.example.test/static/uploads/dashboards/1/d/datasets/a.zip", CORE), [
    { url: `${CORE}/static/uploads/dashboards/1/d/datasets/a.zip`, viaCoreProxy: false },
    { url: "https://old.example.test/static/uploads/dashboards/1/d/datasets/a.zip", viaCoreProxy: false },
  ]);
});

test("buildDashboardLayerFetchTargets: another host's /api/v1 path is not sent to the proxy; empty is empty", () => {
  assert.deepEqual(buildDashboardLayerFetchTargets("https://other.example.test/api/v1/x", CORE), [
    { url: "https://other.example.test/api/v1/x", viaCoreProxy: false },
  ]);
  assert.deepEqual(buildDashboardLayerFetchTargets("   ", CORE), []);
});
