import assert from "node:assert/strict";
import test from "node:test";

import { runBasicSpatialAnalysis } from "./spatial-analysis.ts";

const clipExtentLayer: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "extent" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ]],
      },
    },
  ],
};

test("runBasicSpatialAnalysis buffers point layers into polygons", () => {
  const sourceLayer: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: 1 },
        geometry: {
          type: "Point",
          coordinates: [90.4, 23.8],
        },
      },
    ],
  };

  const result = runBasicSpatialAnalysis({
    sourceFeatureCollection: sourceLayer,
    operation: "buffer",
    bufferDistance: 1,
    bufferUnit: "kilometers",
  });

  assert.equal(result.featureCollection.features.length, 1);
  assert.equal(result.featureCollection.features[0]?.geometry?.type, "Polygon");
  assert.match(result.summary, /Buffered 1 feature/i);
});

test("runBasicSpatialAnalysis clips points and lines to a target extent", () => {
  const sourceLayer: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "inside" },
        geometry: {
          type: "Point",
          coordinates: [0.5, 0.5],
        },
      },
      {
        type: "Feature",
        properties: { name: "outside" },
        geometry: {
          type: "Point",
          coordinates: [2, 2],
        },
      },
      {
        type: "Feature",
        properties: { name: "crossing" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-1, 0.5],
            [2, 0.5],
          ],
        },
      },
    ],
  };

  const result = runBasicSpatialAnalysis({
    sourceFeatureCollection: sourceLayer,
    operation: "clip",
    clipFeatureCollection: clipExtentLayer,
  });

  assert.equal(result.featureCollection.features.length, 2);

  const lineFeature = result.featureCollection.features.find((feature) => feature.properties?.name === "crossing");
  assert.equal(lineFeature?.geometry?.type, "LineString");
  assert.deepEqual(lineFeature?.geometry, {
    type: "LineString",
    coordinates: [
      [0, 0.5],
      [1, 0.5],
    ],
  });
});

test("runBasicSpatialAnalysis clips polygons to a target extent", () => {
  const sourceLayer: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "district" },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-0.5, -0.5],
            [1.5, -0.5],
            [1.5, 1.5],
            [-0.5, 1.5],
            [-0.5, -0.5],
          ]],
        },
      },
    ],
  };

  const result = runBasicSpatialAnalysis({
    sourceFeatureCollection: sourceLayer,
    operation: "clip",
    clipFeatureCollection: clipExtentLayer,
  });

  assert.equal(result.featureCollection.features.length, 1);
  assert.deepEqual(result.featureCollection.features[0]?.geometry, {
    type: "Polygon",
    coordinates: [[
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]],
  });
});
