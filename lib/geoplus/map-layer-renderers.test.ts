import assert from "node:assert/strict";
import test from "node:test";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { buildDeckUserLayers } from "./map-layer-renderers.ts";

const buildPolygonLayer = (): GeoPlusLayerItem => ({
  id: "polygon-upload",
  name: "Parcels",
  sourceMode: "upload",
  engine: "maplibre",
  layerType: "geojson",
  rendererPreference: "deck",
  layerTypePreference: "auto",
  visible: true,
  opacity: 1,
  stylePreset: "emerald",
  fileName: "parcels.gpkg",
  uploadFileSizeBytes: 18 * 1024 * 1024,
  uploadFeatureCountEstimate: 45_000,
  uploadScale: "medium",
  uploadStorageUrl: "opfs://upload-456__parcels.gpkg",
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
});

test("maplibre polygon uploads do not build deck overlays", () => {
  const layers = buildDeckUserLayers([buildPolygonLayer()]);
  assert.equal(layers.length, 0);
});
