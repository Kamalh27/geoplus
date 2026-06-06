import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardDraftSnapshot,
  parseDashboardDraftSnapshot,
} from "./dashboard-draft-storage.ts";
import type { GeoPlusLayerItem } from "../../components/geoplus/types.ts";

test("dashboard draft snapshot round-trips serializable layer state", () => {
  const layer: GeoPlusLayerItem = {
    id: "layer-1",
    name: "Draft upload",
    sourceMode: "upload",
    engine: "deck",
    layerType: "geojson",
    rendererPreference: "deck",
    layerTypePreference: "auto",
    sourceUrl: "opfs://upload-1__draft.geojson",
    uploadStorageUrl: "opfs://upload-1__draft.geojson",
    originalFile: {} as File,
    inlineData: {
      type: "FeatureCollection",
      features: [],
    },
    visible: true,
    opacity: 1,
    stylePreset: "emerald",
  };

  const snapshot = createDashboardDraftSnapshot([layer]);
  const restored = parseDashboardDraftSnapshot(snapshot);

  assert.ok(restored);
  assert.equal(restored?.length, 1);
  assert.equal(restored?.[0].originalFile, undefined);
  assert.deepEqual(restored?.[0].inlineData, layer.inlineData);
  assert.deepEqual(restored?.[0].rawInlineData, layer.inlineData);
});

test("dashboard draft snapshot ignores malformed payloads", () => {
  assert.equal(parseDashboardDraftSnapshot("{\"version\":2}"), null);
  assert.equal(parseDashboardDraftSnapshot("not-json"), null);
});
