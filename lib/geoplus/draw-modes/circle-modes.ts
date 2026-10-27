// Circle draw/edit modes for @mapbox/mapbox-gl-draw.
//
// Replaces the `mapbox-gl-draw-circle` plugin (MIT, Anvesh Arrabochu). That package pins a
// vulnerable @mapbox/mapbox-gl-draw 1.1.1 and requires un-exported `src/*` internals of it. These
// modes keep the same behaviour but use only Draw's public API (`MapboxDraw.lib`, `.constants`,
// `.modes`) and do not mutate the built-in modes.
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import type { Feature, Point, Position } from "geojson";

type ModeThis = MapboxDraw.DrawCustomModeThis;
type DrawMode = MapboxDraw.DrawCustomMode;

type CircleProperties = {
  isCircle: boolean;
  center: Position | [];
  radiusInKm?: number;
};

/** A Draw feature as these modes use it (Draw's typings mark properties readonly). */
type CircleDrawFeature = {
  id: string | number;
  properties: CircleProperties;
  incomingCoords(coords: Position[][]): void;
  getCoordinates(): Position[][];
};

type CircleState = {
  polygon: CircleDrawFeature;
  currentVertexPosition: number;
};

type PointerEvent = MapboxDraw.MapMouseEvent & { lngLat: { lng: number; lat: number } };
type Delta = { lng: number; lat: number };
type DisplayFeature = Feature & { properties: Record<string, unknown> };

const { lib, constants } = MapboxDraw;
const ACTIVE = constants.activeStates.ACTIVE;
const INACTIVE = constants.activeStates.INACTIVE;

const setDragPan = (ctx: ModeThis, enabled: boolean) => {
  setTimeout(() => {
    if (!ctx.map || !ctx.map.dragPan) return;
    if (enabled) {
      // Leave drag-pan disabled when the Draw control was configured without it.
      const store = (ctx as unknown as { _ctx?: { store?: { getInitialConfigValue?: (key: string) => unknown } } })._ctx?.store;
      if (!store?.getInitialConfigValue?.("dragPan")) return;
      ctx.map.dragPan.enable();
    } else {
      ctx.map.dragPan.disable();
    }
  }, 0);
};

/** The four quarter-points of the circle ring, shown as drag handles for resizing. */
const circleHandles = (geojson: DisplayFeature): Array<Feature<Point>> => {
  const ring = (geojson.geometry as GeoJSON.Polygon).coordinates[0].slice(0, -1);
  const id = geojson.properties.id as string;
  const handles: Array<Feature<Point>> = [];
  for (let index = 0; index < ring.length; index += Math.round(ring.length / 4)) {
    handles.push(lib.createVertex(id, ring[index], `0.${index}`, false));
  }
  return handles;
};

const isCircleFeature = (feature: CircleDrawFeature) => Boolean(feature.properties.isCircle);

/** Moves the stored circle centre by however far Draw actually moved the polygon. */
const withCenterFollowing = (ctx: ModeThis, move: () => void) => {
  const circles = (ctx.getSelected() as unknown as CircleDrawFeature[]).filter(isCircleFeature);
  const before = circles.map((circle) => circle.getCoordinates()[0][0]);
  move();
  circles.forEach((circle, index) => {
    const after = circle.getCoordinates()[0][0];
    const center = circle.properties.center;
    if (center.length === 2) {
      center[0] += after[0] - before[index][0];
      center[1] += after[1] - before[index][1];
    }
  });
};

export const DragCircleMode: DrawMode = {
  ...MapboxDraw.modes.draw_polygon,

  onSetup(this: ModeThis): CircleState {
    const polygon = this.newFeature({
      type: "Feature",
      properties: { isCircle: true, center: [] },
      geometry: { type: "Polygon", coordinates: [[]] },
    });
    this.addFeature(polygon);
    this.clearSelectedFeatures();
    lib.doubleClickZoom.disable(this);
    setDragPan(this, false);
    this.updateUIClasses({ mouse: constants.cursors.ADD });
    this.activateUIButton(constants.types.POLYGON);
    this.setActionableState({ trash: true, combineFeatures: false, uncombineFeatures: false });
    return { polygon: polygon as unknown as CircleDrawFeature, currentVertexPosition: 0 };
  },

  onMouseDown(this: ModeThis, state: CircleState, e: PointerEvent) {
    if (state.polygon.properties.center.length === 0) {
      state.polygon.properties.center = [e.lngLat.lng, e.lngLat.lat];
    }
  },

  onDrag(this: ModeThis, state: CircleState, e: PointerEvent) {
    const center = state.polygon.properties.center;
    if (center.length > 0) {
      const radiusInKm = turf.distance(turf.point(center), turf.point([e.lngLat.lng, e.lngLat.lat]), { units: "kilometers" });
      state.polygon.incomingCoords(turf.circle(center, radiusInKm).geometry.coordinates);
      state.polygon.properties.radiusInKm = radiusInKm;
    }
  },

  onMouseUp(this: ModeThis, state: CircleState) {
    setDragPan(this, true);
    return this.changeMode(constants.modes.SIMPLE_SELECT, { featureIds: [state.polygon.id] });
  },

  onClick(this: ModeThis, state: CircleState) {
    // A plain click or tap must not create a circle.
    state.polygon.properties.center = [];
  },

  toDisplayFeatures(this: ModeThis, state: CircleState, geojson: DisplayFeature, display: (geojson: Feature) => void) {
    geojson.properties.active = geojson.properties.id === state.polygon.id ? ACTIVE : INACTIVE;
    return display(geojson);
  },
};
// Touch events carry the same `lngLat` the mouse handlers read.
DragCircleMode.onTouchStart = DragCircleMode.onMouseDown as DrawMode["onTouchStart"];
DragCircleMode.onMouseMove = DragCircleMode.onDrag;
DragCircleMode.onTouchEnd = DragCircleMode.onMouseUp as DrawMode["onTouchEnd"];
DragCircleMode.onTap = DragCircleMode.onClick as DrawMode["onTap"];

const stockSimpleSelect = MapboxDraw.modes.simple_select as unknown as Record<string, (...args: never[]) => unknown>;
const stockDirectSelect = MapboxDraw.modes.direct_select as unknown as Record<string, (...args: never[]) => unknown>;

/** simple_select that moves circle centres along with the polygon and shows circle handles. */
export const SimpleSelectMode: DrawMode = {
  ...MapboxDraw.modes.simple_select,

  dragMove(this: ModeThis, state: unknown, e: unknown) {
    withCenterFollowing(this, () => (stockSimpleSelect.dragMove as (this: ModeThis, state: unknown, e: unknown) => void).call(this, state, e));
  },

  toDisplayFeatures(this: ModeThis, state: unknown, geojson: DisplayFeature, display: (geojson: Feature) => void) {
    if (!geojson.properties.user_isCircle) {
      return (stockSimpleSelect.toDisplayFeatures as (this: ModeThis, ...args: unknown[]) => void).call(this, state, geojson, display);
    }
    geojson.properties.active = this.isSelected(geojson.properties.id as string) ? ACTIVE : INACTIVE;
    display(geojson);
    (this as unknown as { fireActionable(): void }).fireActionable();
    if (geojson.properties.active !== ACTIVE) return;
    circleHandles(geojson).forEach(display);
  },
} as DrawMode;

type DirectSelectState = { featureId: string; feature: CircleDrawFeature; selectedCoordPaths: string[] };

/** direct_select where dragging a circle handle resizes it and dragging the body moves the centre. */
export const DirectMode: DrawMode = {
  ...MapboxDraw.modes.direct_select,

  dragFeature(this: ModeThis, state: unknown, e: unknown, delta: Delta) {
    withCenterFollowing(this, () => (stockDirectSelect.dragFeature as (this: ModeThis, ...args: unknown[]) => void).call(this, state, e, delta));
  },

  dragVertex(this: ModeThis, state: DirectSelectState, e: PointerEvent, delta: Delta) {
    if (!isCircleFeature(state.feature)) {
      return (stockDirectSelect.dragVertex as (this: ModeThis, ...args: unknown[]) => void).call(this, state, e, delta);
    }
    const center = state.feature.properties.center;
    const radiusInKm = turf.distance(turf.point(center), turf.point([e.lngLat.lng, e.lngLat.lat]), { units: "kilometers" });
    state.feature.incomingCoords(turf.circle(center, radiusInKm).geometry.coordinates);
    state.feature.properties.radiusInKm = radiusInKm;
  },

  toDisplayFeatures(this: ModeThis, state: DirectSelectState, geojson: DisplayFeature, push: (geojson: Feature) => void) {
    if (!geojson.properties.user_isCircle) {
      return (stockDirectSelect.toDisplayFeatures as (this: ModeThis, ...args: unknown[]) => void).call(this, state, geojson, push);
    }
    if (state.featureId === geojson.properties.id) {
      geojson.properties.active = ACTIVE;
      push(geojson);
      circleHandles(geojson).forEach(push);
    } else {
      geojson.properties.active = INACTIVE;
      push(geojson);
    }
    (this as unknown as { fireActionable(s: unknown): void }).fireActionable(state);
  },
} as DrawMode;
