import assert from "node:assert/strict";
import test from "node:test";
import { DirectMode, DragCircleMode, SimpleSelectMode } from "./draw-modes/circle-modes.ts";

type Handler = (this: unknown, ...args: unknown[]) => unknown;
const asModes = (mode: unknown) => mode as Record<string, unknown>;
const call = (fn: unknown, ctx: unknown, ...args: unknown[]) => (fn as Handler).call(ctx, ...args);

const makeCircle = (center: [number, number], ring: Array<[number, number]>) => {
  const feature = {
    id: "c1",
    properties: { isCircle: true, center: [...center] as number[], radiusInKm: 1 } as { isCircle: boolean; center: number[]; radiusInKm?: number },
    coords: [ring] as number[][][],
    getCoordinates() {
      return this.coords;
    },
    incomingCoords(next: number[][][]) {
      this.coords = next;
    },
    toGeoJSON() {
      return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: this.coords } };
    },
    type: "Polygon",
  };
  return feature;
};

test("DragCircleMode draws a circle around the pressed centre", () => {
  const polygon = makeCircle([0, 0], [[0, 0]]);
  polygon.properties.center = [];
  const state = { polygon, currentVertexPosition: 0 };
  call(DragCircleMode.onMouseDown, {}, state, { lngLat: { lng: 10, lat: 20 } });
  assert.deepEqual(polygon.properties.center, [10, 20]);
  call(DragCircleMode.onDrag, {}, state, { lngLat: { lng: 10.1, lat: 20 } });
  assert.ok((polygon.properties.radiusInKm ?? 0) > 5 && (polygon.properties.radiusInKm ?? 0) < 15);
  assert.ok(polygon.coords[0].length > 10);
  call(DragCircleMode.onClick, {}, state, {});
  assert.deepEqual(polygon.properties.center, []);
});

test("asModes(DirectMode).dragVertex resizes a circle around its centre", () => {
  const feature = makeCircle([0, 0], [[0, 0]]);
  const state = { featureId: "c1", feature, selectedCoordPaths: [] };
  call(asModes(DirectMode).dragVertex, {}, state, { lngLat: { lng: 0.5, lat: 0 } }, { lng: 0, lat: 0 });
  assert.ok((feature.properties.radiusInKm ?? 0) > 50);
  assert.deepEqual(feature.properties.center, [0, 0]);
});

test("circle features show four resize handles in simple_select and direct_select", () => {
  const ring = Array.from({ length: 33 }, (_, i) => [Math.cos(i / 32 * 2 * Math.PI), Math.sin(i / 32 * 2 * Math.PI)]);
  ring[32] = ring[0];
  const make = () => ({
    type: "Feature",
    properties: { id: "c1", user_isCircle: true },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
  const shown: Array<{ properties: Record<string, unknown> }> = [];
  call(SimpleSelectMode.toDisplayFeatures, { isSelected: () => true, fireActionable: () => {} }, {}, make(), (f: never) => shown.push(f));
  assert.equal(shown.length, 5);
  assert.equal(shown[0].properties.active, "true");

  const pushed: unknown[] = [];
  call(DirectMode.toDisplayFeatures, { fireActionable: () => {} }, { featureId: "c1" }, make(), (f: unknown) => pushed.push(f));
  assert.equal(pushed.length, 5);
});

test("asModes(SimpleSelectMode).dragMove moves the circle polygon and its stored centre together", () => {
  const feature = makeCircle([10, 10], [[11, 10], [10, 11], [9, 10], [10, 9], [11, 10]]);
  const state = { dragMoving: false, dragMoveLocation: { lng: 10, lat: 10 } };
  const ctx = { getSelected: () => [feature] };
  const e = { originalEvent: { stopPropagation() {} }, lngLat: { lng: 12, lat: 13 } };
  call(asModes(SimpleSelectMode).dragMove, ctx, state, e);
  assert.deepEqual(feature.coords[0][0], [13, 13]);
  assert.deepEqual(feature.properties.center, [12, 13]);
  assert.deepEqual(state.dragMoveLocation, { lng: 12, lat: 13 });
});

test("asModes(DirectMode).dragFeature moves the circle polygon and its stored centre together", () => {
  const feature = makeCircle([0, 0], [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]]);
  const state = { dragMoveLocation: { lng: 0, lat: 0 } };
  call(asModes(DirectMode).dragFeature, { getSelected: () => [feature] }, state, { lngLat: { lng: 2, lat: 3 } }, { lng: 2, lat: 3 });
  assert.deepEqual(feature.properties.center, [2, 3]);
  assert.deepEqual(feature.coords[0][0], [3, 3]);
});
