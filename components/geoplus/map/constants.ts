import * as maplibregl from "maplibre-gl";

export const DEFAULT_FLAT_CENTER: [number, number] = [90.4125, 23.8103];
export const DEFAULT_FLAT_ZOOM = 4;
export const DEFAULT_GLOBE_CENTER: [number, number] = [0, 20];
export const DEFAULT_GLOBE_ZOOM = 0;
export const GLOBE_VIEW_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-170, -58],
  [170, 82],
];
