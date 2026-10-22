import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import * as turf from "@turf/turf";
import type { GeoJSON, Position } from "geojson";

type ModeThis = MapboxDraw.DrawCustomModeThis;

type HexagonProperties = {
  isHexagon: boolean;
  center: Position | [];
  radiusInKm?: number;
  active?: string;
};

/** The draw polygon feature as this mode uses it (mutable properties). */
type HexagonPolygon = {
  id: string | number;
  properties: HexagonProperties;
  incomingCoords(coords: Position[][]): void;
};

type HexagonState = {
  polygon: HexagonPolygon;
  currentVertexPosition: number;
};

// The mapbox-gl typings that @types/mapbox__mapbox-gl-draw resolves here do not
// declare `lngLat` on MapMouseEvent, although Draw always provides it.
type PointerEvent = MapboxDraw.MapMouseEvent & { lngLat: { lng: number; lat: number } };

// Draw only hands display features (GeoJSON Features with properties) to this hook.
type DisplayFeature = GeoJSON & { properties: { id?: unknown; active?: string } };

// Hook methods use method syntax so their narrowed parameter types stay
// assignable to Draw's DrawCustomMode signatures.
export const DragHexagonMode = {
  onSetup(this: ModeThis): HexagonState {
    const polygon = this.newFeature({
      type: "Feature",
      properties: { isHexagon: true, center: [] },
      geometry: { type: "Polygon", coordinates: [[]] },
    });
    this.addFeature(polygon);
    this.clearSelectedFeatures();

    setTimeout(() => {
      if (this.map && this.map.dragPan) {
        this.map.dragPan.disable();
      }
    }, 0);

    this.updateUIClasses({ mouse: "add" });
    this.setActionableState({ trash: true, combineFeatures: false, uncombineFeatures: false });
    // Draw's feature typings mark properties readonly; this mode mutates them.
    return { polygon: polygon as unknown as HexagonPolygon, currentVertexPosition: 0 };
  },

  onMouseDown(this: ModeThis, state: HexagonState, e: PointerEvent) {
    const currentCenter = state.polygon.properties.center;
    if (currentCenter.length === 0) {
      state.polygon.properties.center = [e.lngLat.lng, e.lngLat.lat];
    }
  },

  onDrag(this: ModeThis, state: HexagonState, e: PointerEvent) {
    const center = state.polygon.properties.center;
    if (center.length > 0) {
      const distanceInKm = turf.distance(
        turf.point(center),
        turf.point([e.lngLat.lng, e.lngLat.lat]),
        { units: "kilometers" }
      );
      // Generate hexagon (circle with 6 steps)
      const hexagonFeature = turf.circle(center, distanceInKm, { steps: 6 });
      state.polygon.incomingCoords(hexagonFeature.geometry.coordinates);
      state.polygon.properties.radiusInKm = distanceInKm;
    }
  },

  onMouseUp(this: ModeThis, state: HexagonState) {
    setTimeout(() => {
      if (this.map && this.map.dragPan) {
        this.map.dragPan.enable();
      }
    }, 0);
    return this.changeMode("simple_select", { featureIds: [state.polygon.id] });
  },

  onClick(this: ModeThis, state: HexagonState) {
    state.polygon.properties.center = [];
  },

  toDisplayFeatures(
    this: ModeThis,
    state: HexagonState,
    geojson: DisplayFeature,
    display: (geojson: GeoJSON) => void,
  ) {
    const isActivePolygon = geojson.properties.id === state.polygon.id;
    geojson.properties.active = isActivePolygon ? "true" : "false";
    return display(geojson);
  },
};
