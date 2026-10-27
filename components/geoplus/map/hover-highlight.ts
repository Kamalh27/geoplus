import maplibregl from "maplibre-gl";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import type { HoverHighlightStyle } from "@/components/geoplus/map/types";

const HOVER_HIGHLIGHT_SOURCE_ID = "geoplus-hover-highlight-source";
const HOVER_HIGHLIGHT_FILL_LAYER_ID = "geoplus-hover-highlight-fill";
const HOVER_HIGHLIGHT_LINE_LAYER_ID = "geoplus-hover-highlight-line";
const HOVER_HIGHLIGHT_POINT_LAYER_ID = "geoplus-hover-highlight-point";
const DEFAULT_HOVER_HIGHLIGHT_COLOR = "#e8b13f";
const EMPTY_HOVER_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const DEFAULT_HOVER_LINE_WIDTH = 3;
const DEFAULT_HOVER_FILL_OPACITY = 0.8;
const DEFAULT_HOVER_POINT_RADIUS = 8;

const moveHoverHighlightLayersToTop = (map: maplibregl.Map) => {
  for (const layerId of [HOVER_HIGHLIGHT_FILL_LAYER_ID, HOVER_HIGHLIGHT_LINE_LAYER_ID, HOVER_HIGHLIGHT_POINT_LAYER_ID]) {
    if (!map.getLayer(layerId)) {
      continue;
    }
    try {
      map.moveLayer(layerId);
    } catch {
      // Style reloads can briefly make layer ordering unavailable; the next hover will retry.
    }
  }
};

const ensureHoverHighlightLayers = (map: maplibregl.Map) => {
  if (!map.getSource(HOVER_HIGHLIGHT_SOURCE_ID)) {
    map.addSource(HOVER_HIGHLIGHT_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_HOVER_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer(HOVER_HIGHLIGHT_FILL_LAYER_ID)) {
    map.addLayer({
      id: HOVER_HIGHLIGHT_FILL_LAYER_ID,
      type: "fill",
      source: HOVER_HIGHLIGHT_SOURCE_ID,
      paint: {
        "fill-color": ["coalesce", ["get", "__highlightColor"], DEFAULT_HOVER_HIGHLIGHT_COLOR] as unknown as string,
        "fill-opacity": ["coalesce", ["get", "__highlightFillOpacity"], DEFAULT_HOVER_FILL_OPACITY] as unknown as number,
      },
    });
  }

  if (!map.getLayer(HOVER_HIGHLIGHT_LINE_LAYER_ID)) {
    map.addLayer({
      id: HOVER_HIGHLIGHT_LINE_LAYER_ID,
      type: "line",
      source: HOVER_HIGHLIGHT_SOURCE_ID,
      paint: {
        "line-color": ["coalesce", ["get", "__highlightLineColor"], ["get", "__highlightColor"], DEFAULT_HOVER_HIGHLIGHT_COLOR] as unknown as string,
        "line-width": ["coalesce", ["get", "__highlightLineWidth"], DEFAULT_HOVER_LINE_WIDTH] as unknown as number,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(HOVER_HIGHLIGHT_POINT_LAYER_ID)) {
    map.addLayer({
      id: HOVER_HIGHLIGHT_POINT_LAYER_ID,
      type: "circle",
      source: HOVER_HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": ["coalesce", ["get", "__highlightColor"], DEFAULT_HOVER_HIGHLIGHT_COLOR] as unknown as string,
        "circle-radius": ["coalesce", ["get", "__highlightPointRadius"], DEFAULT_HOVER_POINT_RADIUS] as unknown as number,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.92,
      },
    });
  }

  moveHoverHighlightLayersToTop(map);
};

export const setHoverHighlightFeature = (map: maplibregl.Map, feature: GeoJSON.Feature, style: HoverHighlightStyle) => {
  ensureHoverHighlightLayers(map);
  const source = map.getSource(HOVER_HIGHLIGHT_SOURCE_ID);
  if (!source || !("setData" in source)) {
    return;
  }

  const featureWithColor: GeoJSON.Feature = {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      __highlightColor: style.color,
      __highlightLineColor: style.lineColor,
      __highlightLineWidth: style.lineWidth,
      __highlightFillOpacity: style.fillOpacity,
      __highlightPointRadius: style.pointRadius,
    },
  };
  (source as maplibregl.GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [featureWithColor],
  });
};

export const clearHoverHighlightFeature = (map: maplibregl.Map) => {
  const source = map.getSource(HOVER_HIGHLIGHT_SOURCE_ID);
  if (!source || !("setData" in source)) {
    return;
  }
  (source as maplibregl.GeoJSONSource).setData(EMPTY_HOVER_FEATURE_COLLECTION);
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const buildHoverHighlightStyle = (layer: GeoPlusLayerItem | undefined, geometryType: GeoJSON.Geometry["type"]): HoverHighlightStyle => {
  const isPointGeometry = geometryType === "Point" || geometryType === "MultiPoint";
  const isLineGeometry = geometryType === "LineString" || geometryType === "MultiLineString";
  const isPolygonGeometry = geometryType === "Polygon" || geometryType === "MultiPolygon";

  const defaultFillOpacity = isPolygonGeometry ? DEFAULT_HOVER_FILL_OPACITY : 0;
  const defaultLineWidth = isPolygonGeometry ? 3.4 : isLineGeometry ? 4.2 : 2.4;
  const defaultPointRadius = isPointGeometry ? 9.2 : 0;

  return {
    color: layer?.interactionConfig?.hoverHighlightColor ?? DEFAULT_HOVER_HIGHLIGHT_COLOR,
    lineColor: layer?.interactionConfig?.hoverLineColor ?? layer?.interactionConfig?.hoverHighlightColor ?? DEFAULT_HOVER_HIGHLIGHT_COLOR,
    fillOpacity: clampNumber(layer?.interactionConfig?.hoverFillOpacity ?? defaultFillOpacity, 0, 0.8),
    lineWidth: clampNumber(layer?.interactionConfig?.hoverLineWidth ?? defaultLineWidth, 1, 8),
    pointRadius: clampNumber(layer?.interactionConfig?.hoverPointRadius ?? defaultPointRadius, 0, 20),
  };
};
