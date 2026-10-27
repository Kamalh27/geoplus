import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { DragHexagonMode } from "@/lib/geoplus/draw-modes/drag-hexagon-mode";
// @ts-expect-error This draw mode package does not ship TypeScript declarations.
import DrawRectangle from "mapbox-gl-draw-rectangle-mode";
import { DragCircleMode, DirectMode, SimpleSelectMode } from "@/lib/geoplus/draw-modes/circle-modes";

export function createDrawControl() {
  return new MapboxDraw({
    displayControlsDefault: false,
    userProperties: true,
    modes: {
      ...MapboxDraw.modes,
      draw_rectangle: DrawRectangle,
      draw_circle: DragCircleMode,
      draw_hexagon: DragHexagonMode,
      direct_select: DirectMode,
      simple_select: SimpleSelectMode,
    },
    controls: {
      point: false,
      line_string: false,
      polygon: false,
      trash: false,
      combine_features: false,
      uncombine_features: false,
    },
    // Use GeoPlus emerald theme colors for drawing
    styles: [
      // ACTIVE (being drawn)
      {
        id: "gl-draw-polygon-fill-active",
        type: "fill",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
        paint: {
          "fill-color": "#0ea67d",
          "fill-opacity": 0.1,
        },
      },
      {
        id: "gl-draw-polygon-stroke-active",
        type: "line",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#0ea67d",
          "line-dasharray": [0.2, 2],
          "line-width": 2,
        },
      },
      {
        id: "gl-draw-line-active",
        type: "line",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "LineString"]],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#0ea67d",
          "line-dasharray": [0.2, 2],
          "line-width": 2,
        },
      },
      {
        id: "gl-draw-polygon-and-line-vertex-active",
        type: "circle",
        filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#0ea67d",
          "circle-stroke-width": 2,
        },
      },
      // INACTIVE (already drawn)
      {
        id: "gl-draw-polygon-fill-inactive",
        type: "fill",
        filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
        paint: {
          "fill-color": "#0ea67d",
          "fill-opacity": 0.1,
        },
      },
      {
        id: "gl-draw-polygon-stroke-inactive",
        type: "line",
        filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#0ea67d",
          "line-width": 2,
        },
      },
      {
        id: "gl-draw-line-inactive",
        type: "line",
        filter: ["all", ["==", "active", "false"], ["==", "$type", "LineString"], ["!=", "mode", "static"]],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#0ea67d",
          "line-width": 2,
        },
      },
      {
        id: "gl-draw-point-inactive",
        type: "circle",
        filter: ["all", ["==", "active", "false"], ["==", "$type", "Point"], ["==", "meta", "feature"], ["!=", "mode", "static"]],
        paint: {
          "circle-radius": 6,
          "circle-color": "#0ea67d",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      {
        id: "gl-draw-point-active",
        type: "circle",
        filter: ["all", ["==", "active", "true"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
        paint: {
          "circle-radius": 8,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#0ea67d",
          "circle-stroke-width": 2,
        },
      },
    ],
  });
}
