import * as turf from "@turf/turf";

export const DragHexagonMode = {
  onSetup: function (this: any, opts: any) {
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
    this.setActionableState({ trash: true });
    return { polygon, currentVertexPosition: 0 };
  },

  onMouseDown: function (this: any, state: any, e: any) {
    const currentCenter = state.polygon.properties.center;
    if (currentCenter.length === 0) {
      state.polygon.properties.center = [e.lngLat.lng, e.lngLat.lat];
    }
  },

  onDrag: function (this: any, state: any, e: any) {
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

  onMouseUp: function (this: any, state: any, e: any) {
    setTimeout(() => {
      if (this.map && this.map.dragPan) {
        this.map.dragPan.enable();
      }
    }, 0);
    return this.changeMode("simple_select", { featureIds: [state.polygon.id] });
  },

  onClick: function (this: any, state: any, e: any) {
    state.polygon.properties.center = [];
  },

  toDisplayFeatures: function (this: any, state: any, geojson: any, display: any) {
    const isActivePolygon = geojson.properties.id === state.polygon.id;
    geojson.properties.active = isActivePolygon ? "true" : "false";
    return display(geojson);
  },
};
