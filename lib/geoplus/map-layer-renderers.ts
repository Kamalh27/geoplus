import type { Layer as DeckLayer } from "@deck.gl/core";
import { GeoJsonLayer, IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type maplibregl from "maplibre-gl";

import type {
  GeoPlusColorRamp,
  GeoPlusClassificationMethod,
  GeoPlusLayerItem,
  GeoPlusLayerStylePreset,
  GeoPlusLayerType,
  GeoPlusMarkerStyle,
  GeoPlusMarkerSymbol,
} from "@/components/geoplus/types";
import { buildDeckTilesetLayer } from "@/lib/geoplus/tilesets/deck-tile-layer-scripts";
import { isCogMapLibreLayer, syncCogMapLibreLayer } from "@/lib/geoplus/tilesets/cog-maplibre";
import { isPmtilesMapLibreLayer, syncPmtilesMapLibreLayer } from "@/lib/geoplus/tilesets/pmtiles-maplibre";
import { isMbtilesMapLibreLayer, syncMbtilesMapLibreLayer } from "@/lib/geoplus/tilesets/mbtiles-maplibre";
import { isZarrMapLibreLayer, syncZarrMapLibreLayer } from "@/lib/geoplus/tilesets/zarr-maplibre";

import { getLayerColorRampColors } from "@/lib/geoplus/layer-helpers";
import { humanizeColumnName } from "@/lib/geoplus/duckdb-spatial-analytics";




export const MAPLIBRE_LAYER_PREFIX = "geoplus-user-";

const isArrayOrTypedArray = (value: unknown): value is ArrayLike<unknown> & Iterable<unknown> => {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
};

type DeckPoint = {
  position: [number, number];
  weight: number;
  properties: Record<string, unknown>;
};

type LayerStyleColors = {
  fill: [number, number, number];
  line: [number, number, number];
  point: [number, number, number];
  label: [number, number, number];
};

type LayerStyleSpec = {
  fill: [number, number, number];
  line: [number, number, number];
  point: [number, number, number];
  label: [number, number, number];
  fillOpacity: number;
  lineWidth: number;
  pointRadius: number;
  labelSize: number;
  markerStyle: GeoPlusMarkerStyle;
  markerSymbol: GeoPlusMarkerSymbol;
  customMarkerDataUrl?: string;
  colorByField?: string;
  colorRamp: GeoPlusColorRamp;
  classificationMethod: GeoPlusClassificationMethod;
  classificationClasses: number;
};

type DeckLabelPoint = {
  position: [number, number];
  text: string;
};

type DeckMarkerSymbolPoint = {
  position: [number, number];
  symbol: string;
  color: [number, number, number];
};

type DeckImageMarkerPoint = {
  position: [number, number];
  color: [number, number, number];
};

type AttributeColorSpec = {
  field: string;
  type: "categorical" | "continuous";
  map?: Map<string, [number, number, number]>;
  intervals?: Array<{ max: number; color: [number, number, number] }>;
  rampLength: number;
};

const LAYER_STYLE_PRESETS: Record<GeoPlusLayerStylePreset, LayerStyleColors> = {
  emerald: {
    fill: [34, 197, 94],
    line: [20, 184, 166],
    point: [6, 182, 212],
    label: [15, 118, 110],
  },
  sky: {
    fill: [56, 189, 248],
    line: [37, 99, 235],
    point: [14, 165, 233],
    label: [30, 64, 175],
  },
  amber: {
    fill: [251, 191, 36],
    line: [217, 119, 6],
    point: [245, 158, 11],
    label: [146, 64, 14],
  },
  rose: {
    fill: [251, 113, 133],
    line: [225, 29, 72],
    point: [244, 63, 94],
    label: [159, 18, 57],
  },
  slate: {
    fill: [100, 116, 139],
    line: [51, 65, 85],
    point: [71, 85, 105],
    label: [15, 23, 42],
  },
  violet: {
    fill: [167, 139, 250],
    line: [124, 58, 237],
    point: [139, 92, 246],
    label: [91, 33, 182],
  },
  lime: {
    fill: [132, 204, 22],
    line: [101, 163, 13],
    point: [163, 230, 53],
    label: [63, 98, 18],
  },
  teal: {
    fill: [20, 184, 166],
    line: [15, 118, 110],
    point: [45, 212, 191],
    label: [19, 78, 74],
  },
};

const MARKER_SYMBOLS: Record<GeoPlusMarkerSymbol, string> = {
  dot: "●",
  diamond: "◆",
  triangle: "▲",
  square: "■",
  star: "★",
  pin: "📍",
};

const toSafeLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getManagedMapLibreIds = (layerId: string) => {
  const safeId = toSafeLayerId(layerId);
  const sourceId = `${MAPLIBRE_LAYER_PREFIX}src-${safeId}`;
  return {
    sourceId,
    fillLayerId: `${MAPLIBRE_LAYER_PREFIX}${safeId}-fill`,
    lineLayerId: `${MAPLIBRE_LAYER_PREFIX}${safeId}-line`,
    pointLayerId: `${MAPLIBRE_LAYER_PREFIX}${safeId}-point`,
    markerSymbolLayerId: `${MAPLIBRE_LAYER_PREFIX}${safeId}-marker`,
    labelLayerId: `${MAPLIBRE_LAYER_PREFIX}${safeId}-label`,
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const clampOpacity = (value: number | undefined) => {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return 1;
  }
  return Math.max(0, Math.min(1, candidate));
};

const clampNumber = (value: number | undefined, min: number, max: number, fallback: number) => {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, candidate));
};

const clampInteger = (value: number | undefined, min: number, max: number, fallback: number) =>
  Math.round(clampNumber(value, min, max, fallback));

const toTrimmedString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isGeoPlusMarkerStyle = (value: unknown): value is GeoPlusMarkerStyle =>
  value === "solid" || value === "ring" || value === "glow" || value === "symbol" || value === "image";

const isGeoPlusMarkerSymbol = (value: unknown): value is GeoPlusMarkerSymbol =>
  value === "dot" || value === "diamond" || value === "triangle" || value === "square" || value === "star" || value === "pin";

const isGeoPlusColorRamp = (value: unknown): value is GeoPlusColorRamp => value === "vivid" || value === "earth" || value === "pastel";

const parseHexColor = (value: string | undefined, fallback: [number, number, number]): [number, number, number] => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  const compact = normalized.replace(/^#/, "");
  const fullHex = compact.length === 3
    ? compact
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : compact;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return fallback;
  }

  return [
    Number.parseInt(fullHex.slice(0, 2), 16),
    Number.parseInt(fullHex.slice(2, 4), 16),
    Number.parseInt(fullHex.slice(4, 6), 16),
  ];
};

const getLayerOpacity = (layer: GeoPlusLayerItem) => clampOpacity(layer.opacity);

const getLayerStyleColors = (layer: GeoPlusLayerItem) => {
  const preset = layer.stylePreset;
  return preset ? (LAYER_STYLE_PRESETS[preset] ?? LAYER_STYLE_PRESETS.emerald) : LAYER_STYLE_PRESETS.emerald;
};

const isGeoPlusClassificationMethod = (value: unknown): value is GeoPlusClassificationMethod => value === "categorical" || value === "equal-interval" || value === "quantile";

const getLayerStyleSpec = (layer: GeoPlusLayerItem): LayerStyleSpec => {
  const presetColors = getLayerStyleColors(layer);
  const config = layer.styleConfig;
  return {
    fill: parseHexColor(config?.fillColor, presetColors.fill),
    line: parseHexColor(config?.lineColor, presetColors.line),
    point: parseHexColor(config?.pointColor, presetColors.point),
    label: parseHexColor(config?.labelColor, presetColors.label),
    fillOpacity: clampNumber(config?.fillOpacity, 0, 1, 0.18),
    lineWidth: clampNumber(config?.lineWidth, 0.5, 12, 2),
    pointRadius: clampNumber(config?.pointRadius, 2, 24, 5),
    labelSize: clampNumber(config?.labelSize, 9, 28, 13),
    markerStyle: isGeoPlusMarkerStyle(config?.markerStyle) ? config.markerStyle : "solid",
    markerSymbol: isGeoPlusMarkerSymbol(config?.markerSymbol) ? config.markerSymbol : "dot",
    customMarkerDataUrl: toTrimmedString(config?.customMarkerDataUrl),
    colorByField: toTrimmedString(config?.colorByField),
    colorRamp: isGeoPlusColorRamp(config?.colorRamp) ? config.colorRamp : "vivid",
    classificationMethod: isGeoPlusClassificationMethod(config?.classificationMethod) ? config.classificationMethod : "categorical",
    classificationClasses: clampInteger(config?.classificationClasses, 3, 9, 5),
  };
};

const withAlpha = (rgb: [number, number, number], alpha: number): [number, number, number, number] => [rgb[0], rgb[1], rgb[2], alpha];
const rgbToCss = (rgb: [number, number, number]) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
const isDeckTileLayerType = (layerType: GeoPlusLayerType) => layerType === "mvt" || layerType === "raster-tile" || layerType === "wms";

const extractScatterPoints = (inlineData: unknown): DeckPoint[] => {
  const geojson = asRecord(inlineData);
  if (!geojson) {
    return [];
  }

  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const points: DeckPoint[] = [];

  for (const feature of features) {
    const featureRecord = asRecord(feature);
    const geometry = asRecord(featureRecord?.geometry);
    if (!geometry || geometry.type !== "Point") {
      continue;
    }

    const coordinates = isArrayOrTypedArray(geometry.coordinates) ? geometry.coordinates : [];
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    const properties = asRecord(featureRecord?.properties);
    const weightCandidate = Number(properties?.weight ?? properties?.value ?? 1);
    points.push({
      position: [longitude, latitude],
      weight: Number.isFinite(weightCandidate) ? weightCandidate : 1,
      properties: properties ?? {},
    });
  }

  return points;
};

type AnchorBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const updateAnchorBounds = (bounds: AnchorBounds, longitude: number, latitude: number) => {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return;
  }
  bounds.minLng = Math.min(bounds.minLng, longitude);
  bounds.minLat = Math.min(bounds.minLat, latitude);
  bounds.maxLng = Math.max(bounds.maxLng, longitude);
  bounds.maxLat = Math.max(bounds.maxLat, latitude);
};

const walkAnchorCoordinates = (value: unknown, bounds: AnchorBounds) => {
  if (!isArrayOrTypedArray(value) || value.length === 0) {
    return;
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    updateAnchorBounds(bounds, Number(value[0]), Number(value[1]));
    return;
  }

  for (const child of value) {
    walkAnchorCoordinates(child, bounds);
  }
};

const getGeometryAnchor = (geometryValue: unknown): [number, number] | null => {
  const geometry = asRecord(geometryValue);
  if (!geometry || typeof geometry.type !== "string") {
    return null;
  }

  if (geometry.type === "Point") {
    const coordinates = isArrayOrTypedArray(geometry.coordinates) ? geometry.coordinates : [];
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }
    return [longitude, latitude];
  }

  if (geometry.type === "GeometryCollection") {
    const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
    const anchorBounds: AnchorBounds = {
      minLng: Number.POSITIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    };
    for (const subGeometry of geometries) {
      const anchor = getGeometryAnchor(subGeometry);
      if (!anchor) {
        continue;
      }
      updateAnchorBounds(anchorBounds, anchor[0], anchor[1]);
    }
    if (
      Number.isFinite(anchorBounds.minLng) &&
      Number.isFinite(anchorBounds.minLat) &&
      Number.isFinite(anchorBounds.maxLng) &&
      Number.isFinite(anchorBounds.maxLat)
    ) {
      return [(anchorBounds.minLng + anchorBounds.maxLng) / 2, (anchorBounds.minLat + anchorBounds.maxLat) / 2];
    }
    return null;
  }

  const bounds: AnchorBounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };
  walkAnchorCoordinates(geometry.coordinates, bounds);
  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.minLat) || !Number.isFinite(bounds.maxLng) || !Number.isFinite(bounds.maxLat)) {
    return null;
  }
  return [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2];
};

const getFeatureCollection = (value: unknown): GeoJSON.FeatureCollection | null => {
  const geojson = asRecord(value);
  if (!geojson || typeof geojson.type !== "string") {
    return null;
  }

  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    return geojson as unknown as GeoJSON.FeatureCollection;
  }

  if (geojson.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [geojson as unknown as GeoJSON.Feature],
    };
  }

  return null;
};

const getFeatureProperty = (featureValue: unknown, field: string): unknown => {
  const feature = asRecord(featureValue);
  const properties = asRecord(feature?.properties);
  return properties?.[field];
};

const toCategoryKey = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "__unknown__";
  }
  const text = String(value).trim();
  return text.length > 0 ? text : "__unknown__";
};

const toRgbColor = (value: string, fallback: [number, number, number]): [number, number, number] => parseHexColor(value, fallback);

// ... replacing categorical spec builders
const buildAttributeColorSpec = (
  layer: GeoPlusLayerItem,
  styleSpec: LayerStyleSpec,
): AttributeColorSpec | null => {
  const field = styleSpec.colorByField;
  if (!field) {
    return null;
  }

  const featureCollection = getFeatureCollection(layer.inlineData ?? layer.rawInlineData);
  if (!featureCollection) {
    return null;
  }

  const ramp = getLayerColorRampColors(layer);

  if (styleSpec.classificationMethod === "categorical") {
    const uniqueValues = new Set<string>();
    for (const feature of featureCollection.features) {
      uniqueValues.add(toCategoryKey(getFeatureProperty(feature, field)));
      if (uniqueValues.size >= 12) {
        break;
      }
    }

    if (uniqueValues.size === 0) {
      return null;
    }

    const map = new Map<string, [number, number, number]>();
    [...uniqueValues].forEach((value, index) => {
      const hex = ramp[index % ramp.length] ?? ramp[0];
      map.set(value, toRgbColor(hex, styleSpec.point));
    });
    return { field, type: "categorical", map, rampLength: ramp.length };
  }

  // Continuous (Quantile or Equal Interval)
  const values: number[] = [];
  for (const feature of featureCollection.features) {
    const val = getFeatureProperty(feature, field);
    const num = Number(val);
    if (Number.isFinite(num)) {
      values.push(num);
    }
  }

  if (values.length === 0) {
    return null;
  }

  values.sort((a, b) => a - b);
  const min = values[0]!;
  const max = values[values.length - 1]!;
  const classCount = Math.min(styleSpec.classificationClasses, ramp.length);
  const intervals: Array<{ max: number; color: [number, number, number] }> = [];

  if (styleSpec.classificationMethod === "quantile") {
    for (let i = 1; i <= classCount; i++) {
      const q = i / classCount;
      const index = Math.floor(q * (values.length - 1));
      const hex = ramp[Math.floor(((i - 1) / (classCount - 1)) * (ramp.length - 1))] ?? ramp[0];
      intervals.push({ max: values[index]!, color: toRgbColor(hex, styleSpec.point) });
    }
  } else {
    // Equal Interval
    const step = (max - min) / classCount;
    for (let i = 1; i <= classCount; i++) {
      const hex = ramp[Math.floor(((i - 1) / (classCount - 1)) * (ramp.length - 1))] ?? ramp[0];
      intervals.push({ max: min + step * i, color: toRgbColor(hex, styleSpec.point) });
    }
  }
  
  // ensure last interval catches max precisely
  intervals[intervals.length - 1].max = Number.POSITIVE_INFINITY;

  return { field, type: "continuous", intervals, rampLength: ramp.length };
};

const getAttributeColor = (
  featureValue: unknown,
  spec: AttributeColorSpec | null,
  fallback: [number, number, number],
): [number, number, number] => {
  if (!spec) {
    return fallback;
  }

  if (spec.type === "categorical" && spec.map) {
    const key = toCategoryKey(getFeatureProperty(featureValue, spec.field));
    return spec.map.get(key) ?? fallback;
  }

  if (spec.type === "continuous" && spec.intervals) {
    const val = Number(getFeatureProperty(featureValue, spec.field));
    if (!Number.isFinite(val)) return fallback;
    for (const interval of spec.intervals) {
      if (val <= interval.max) return interval.color;
    }
  }

  return fallback;
};

const getMapLibreAttributeColorExpression = (
  spec: AttributeColorSpec | null,
  fallback: [number, number, number],
) => {
  if (!spec) {
    return rgbToCss(fallback);
  }

  if (spec.type === "categorical" && spec.map && spec.map.size > 0) {
    const expression: unknown[] = ["match", ["to-string", ["coalesce", ["get", spec.field], "__unknown__"]]];
    for (const [key, color] of spec.map.entries()) {
      expression.push(key, rgbToCss(color));
    }
    expression.push(rgbToCss(fallback));
    return expression as unknown as string;
  }

  if (spec.type === "continuous" && spec.intervals && spec.intervals.length > 0) {
    const expression: unknown[] = ["step", ["to-number", ["get", spec.field], 0]];
    // Step evaluates as: [step, input, output0, stop1, output1, stop2, output2...]
    expression.push(rgbToCss(spec.intervals[0].color)); // Value below first step
    for (let i = 0; i < spec.intervals.length - 1; i++) {
      expression.push(spec.intervals[i].max);
      expression.push(rgbToCss(spec.intervals[i + 1].color));
    }
    return expression as unknown as string;
  }

  return rgbToCss(fallback);
};

const getLayerMarkerSymbol = (styleSpec: LayerStyleSpec) => MARKER_SYMBOLS[styleSpec.markerSymbol] ?? MARKER_SYMBOLS.dot;

const toLabelText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const getLayerSymbolMarkerPoints = (
  layer: GeoPlusLayerItem,
  styleSpec: LayerStyleSpec,
  colorSpec: AttributeColorSpec | null,
): DeckMarkerSymbolPoint[] => {
  const source = getFeatureCollection(layer.inlineData ?? layer.rawInlineData);
  if (!source) {
    return [];
  }

  const symbol = getLayerMarkerSymbol(styleSpec);
  const markerPoints: DeckMarkerSymbolPoint[] = [];
  for (const feature of source.features) {
    const featureRecord = asRecord(feature);
    const geometry = asRecord(featureRecord?.geometry);
    if (!geometry || geometry.type !== "Point") {
      continue;
    }

    const coordinates = isArrayOrTypedArray(geometry.coordinates) ? geometry.coordinates : [];
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    markerPoints.push({
      position: [longitude, latitude],
      symbol,
      color: getAttributeColor(feature, colorSpec, styleSpec.point),
    });
  }

  return markerPoints;
};

const getLayerImageMarkerPoints = (
  layer: GeoPlusLayerItem,
  styleSpec: LayerStyleSpec,
  colorSpec: AttributeColorSpec | null,
): DeckImageMarkerPoint[] => {
  const source = getFeatureCollection(layer.inlineData ?? layer.rawInlineData);
  if (!source) {
    return [];
  }

  const markerPoints: DeckImageMarkerPoint[] = [];
  for (const feature of source.features) {
    const featureRecord = asRecord(feature);
    const geometry = asRecord(featureRecord?.geometry);
    if (!geometry || geometry.type !== "Point") {
      continue;
    }

    const coordinates = isArrayOrTypedArray(geometry.coordinates) ? geometry.coordinates : [];
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    markerPoints.push({
      position: [longitude, latitude],
      color: getAttributeColor(feature, colorSpec, styleSpec.point),
    });
  }

  return markerPoints;
};

const getLayerLabelPoints = (layer: GeoPlusLayerItem): DeckLabelPoint[] => {
  if (!layer.labelEnabled) {
    return [];
  }
  const labelField = layer.labelField?.trim();
  if (!labelField) {
    return [];
  }

  const source = getFeatureCollection(layer.inlineData ?? layer.rawInlineData);
  if (!source) {
    return [];
  }

  const labelPoints: DeckLabelPoint[] = [];
  for (const feature of source.features) {
    const featureRecord = asRecord(feature);
    const properties = asRecord(featureRecord?.properties);
    const labelText = toLabelText(properties?.[labelField]);
    if (!labelText) {
      continue;
    }
    const anchor = getGeometryAnchor(featureRecord?.geometry);
    if (!anchor) {
      continue;
    }
    labelPoints.push({
      position: anchor,
      text: labelText,
    });
  }
  return labelPoints;
};

export const syncMapLibreUserLayers = (map: maplibregl.Map, layers: GeoPlusLayerItem[]) => {
  if (!map.isStyleLoaded()) {
    return;
  }

  const style = map.getStyle();
  const styleLayers = [...(style.layers ?? [])].reverse();

  for (const layer of styleLayers) {
    if (layer.id.startsWith(MAPLIBRE_LAYER_PREFIX) && map.getLayer(layer.id)) {
      map.removeLayer(layer.id);
    }
  }

  const styleSources = style.sources ?? {};
  for (const sourceId of Object.keys(styleSources)) {
    if (sourceId.startsWith(MAPLIBRE_LAYER_PREFIX) && map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  }

  for (const layer of layers) {
    if (layer.engine !== "maplibre" || !layer.visible) {
      continue;
    }

    if (isDeckTileLayerType(layer.layerType) && !isPmtilesMapLibreLayer(layer) && !isCogMapLibreLayer(layer) && !isMbtilesMapLibreLayer(layer) && !isZarrMapLibreLayer(layer)) {
      continue;
    }

    const ids = getManagedMapLibreIds(layer.id);
    const styleSpec = getLayerStyleSpec(layer);
    const attributeColorSpec = buildAttributeColorSpec(layer, styleSpec);
    const layerOpacity = getLayerOpacity(layer);
    if (isCogMapLibreLayer(layer)) {
      syncCogMapLibreLayer({
        map,
        layer,
        layerOpacity,
      });
      continue;
    }
    if (isPmtilesMapLibreLayer(layer)) {
      void syncPmtilesMapLibreLayer({
        map,
        layer,
        layerOpacity,
        styleColors: {
          fill: styleSpec.fill,
          line: styleSpec.line,
          point: styleSpec.point,
        },
      });
      continue;
    }
    if (isMbtilesMapLibreLayer(layer)) {
      void syncMbtilesMapLibreLayer({
        map,
        layer,
        layerOpacity,
        styleColors: {
          fill: styleSpec.fill,
          line: styleSpec.line,
          point: styleSpec.point,
        },
      });
      continue;
    }
    if (isZarrMapLibreLayer(layer)) {
      void syncZarrMapLibreLayer({
        map,
        layer,
        layerOpacity,
      });
      continue;
    }
    if (layer.layerType === "geojson") {
      const data = layer.sourceUrl ?? layer.inlineData;
      if (!data) {
        continue;
      }

      map.addSource(ids.sourceId, {
        type: "geojson",
        data: data as string | GeoJSON.GeoJSON,
      });

      map.addLayer({
        id: ids.fillLayerId,
        type: "fill",
        source: ids.sourceId,
        paint: {
          "fill-color": getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.fill),
          "fill-opacity": styleSpec.fillOpacity * layerOpacity,
        },
      });

      map.addLayer({
        id: ids.lineLayerId,
        type: "line",
        source: ids.sourceId,
        paint: {
          "line-color": getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.line),
          "line-width": styleSpec.lineWidth,
          "line-opacity": 0.9 * layerOpacity,
        },
      });

      const isRingStyle = styleSpec.markerStyle === "ring";
      const isGlowStyle = styleSpec.markerStyle === "glow";
      const isSymbolStyle = styleSpec.markerStyle === "symbol";
      const markerBaseRadius = styleSpec.pointRadius;
      const markerRadius = isGlowStyle ? markerBaseRadius + 3 : isRingStyle ? markerBaseRadius + 1 : markerBaseRadius;
      const markerOpacity = isSymbolStyle ? 0 : isRingStyle ? 0.18 * layerOpacity : isGlowStyle ? 0.62 * layerOpacity : layerOpacity;
      const markerStrokeWidth = isRingStyle ? 2.4 : isGlowStyle ? 1.6 : 1.2;
      const markerStrokeColor = getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.point);

      map.addLayer({
        id: ids.pointLayerId,
        type: "circle",
        source: ids.sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": markerRadius,
          "circle-color": getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.point),
          "circle-opacity": markerOpacity,
          "circle-stroke-width": markerStrokeWidth,
          "circle-stroke-color": markerStrokeColor,
          "circle-blur": isGlowStyle ? 0.34 : 0,
        },
      });

      if (isSymbolStyle) {
        map.addLayer({
          id: ids.markerSymbolLayerId,
          type: "symbol",
          source: ids.sourceId,
          filter: ["==", ["geometry-type"], "Point"],
          layout: {
            "text-field": getLayerMarkerSymbol(styleSpec),
            "text-size": clampInteger(styleSpec.pointRadius * 2.4, 12, 56, 18),
            "text-anchor": "center",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.point),
            "text-opacity": 0.92 * layerOpacity,
            "text-halo-color": "rgba(15,23,42,0.78)",
            "text-halo-width": 1.1,
          },
        });
      }

      const labelField = layer.labelField?.trim();
      if (layer.labelEnabled && labelField) {
        map.addLayer({
          id: ids.labelLayerId,
          type: "symbol",
          source: ids.sourceId,
          layout: {
            "text-field": ["to-string", ["coalesce", ["get", labelField], ""]] as unknown as string,
            "text-size": styleSpec.labelSize,
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
            "text-offset": [0, 1.08],
            "text-anchor": "top",
          },
          paint: {
            "text-color": rgbToCss(styleSpec.label),
            "text-opacity": layerOpacity,
            "text-halo-color": "rgba(15,23,42,0.85)",
            "text-halo-width": 1.2,
          },
        });
      }
      continue;
    }
  }
};

export const buildDeckUserLayers = (layers: GeoPlusLayerItem[]): DeckLayer[] => {
  const deckLayers: DeckLayer[] = [];

  for (const layer of layers) {
    if (!layer.visible) {
      continue;
    }

    if (isPmtilesMapLibreLayer(layer) || isCogMapLibreLayer(layer) || isMbtilesMapLibreLayer(layer) || isZarrMapLibreLayer(layer)) {
      continue;
    }

    if (layer.engine !== "deck" && !isDeckTileLayerType(layer.layerType)) {
      continue;
    }

    const layerId = `user-${toSafeLayerId(layer.id)}`;
    const styleSpec = getLayerStyleSpec(layer);
    const attributeColorSpec = buildAttributeColorSpec(layer, styleSpec);
    const layerOpacity = getLayerOpacity(layer);
    if (layer.layerType === "geojson") {
      const data = layer.sourceUrl ?? layer.inlineData;
      if (!data) {
        continue;
      }
      const isRingStyle = styleSpec.markerStyle === "ring";
      const isGlowStyle = styleSpec.markerStyle === "glow";
      const isSymbolStyle = styleSpec.markerStyle === "symbol";
      const isImageStyle = styleSpec.markerStyle === "image" && Boolean(styleSpec.customMarkerDataUrl);
      deckLayers.push(
        new GeoJsonLayer({
          id: layerId,
          data,
          pickable: true,
          stroked: true,
          filled: true,
          pointType: "circle",
          opacity: layerOpacity,
          getFillColor: (feature: unknown) =>
            withAlpha(getAttributeColor(feature, attributeColorSpec, styleSpec.fill), Math.round(255 * styleSpec.fillOpacity)),
          getLineColor: (feature: unknown) => withAlpha(getAttributeColor(feature, attributeColorSpec, styleSpec.line), 230),
          getPointFillColor: (feature: unknown) =>
            withAlpha(
              getAttributeColor(feature, attributeColorSpec, styleSpec.point),
              isSymbolStyle || isImageStyle ? 0 : isRingStyle ? 70 : isGlowStyle ? 165 : 220,
            ),
          lineWidthUnits: "pixels",
          pointRadiusUnits: "pixels",
          lineWidthMinPixels: styleSpec.lineWidth,
          pointRadiusMinPixels: isGlowStyle ? styleSpec.pointRadius + 2 : styleSpec.pointRadius,
          getLineWidth: styleSpec.lineWidth,
          getPointRadius: isGlowStyle ? styleSpec.pointRadius + 2 : styleSpec.pointRadius,
          updateTriggers: {
            getFillColor: [styleSpec.fill, styleSpec.fillOpacity, attributeColorSpec],
            getLineColor: [styleSpec.line, attributeColorSpec],
            getPointFillColor: [styleSpec.point, styleSpec.markerStyle, attributeColorSpec],
            getLineWidth: [styleSpec.lineWidth],
            getPointRadius: [styleSpec.pointRadius, styleSpec.markerStyle],
          },
        } as never),
      );

      const labelPoints = getLayerLabelPoints(layer);
      if (labelPoints.length > 0) {
        deckLayers.push(
          new TextLayer<DeckLabelPoint>({
            id: `${layerId}-labels`,
            data: labelPoints,
            pickable: false,
            billboard: true,
            fontWeight: 600,
            sizeUnits: "pixels",
            getPosition: (point) => point.position,
            getText: (point) => point.text,
            getColor: withAlpha(styleSpec.label, Math.round(255 * layerOpacity)),
            getSize: styleSpec.labelSize,
            getTextAnchor: "middle",
            getAlignmentBaseline: "bottom",
            updateTriggers: {
              getColor: [styleSpec.label, layerOpacity],
              getSize: [styleSpec.labelSize],
            },
          }),
        );
      }

      if (isSymbolStyle) {
        const markerPoints = getLayerSymbolMarkerPoints(layer, styleSpec, attributeColorSpec);
        if (markerPoints.length > 0) {
          deckLayers.push(
            new TextLayer<DeckMarkerSymbolPoint>({
              id: `${layerId}-marker-symbol`,
              data: markerPoints,
              pickable: false,
              billboard: true,
              sizeUnits: "pixels",
              getPosition: (point) => point.position,
              getText: (point) => point.symbol,
              getColor: (point) => withAlpha(point.color, Math.round(255 * layerOpacity)),
              getSize: clampInteger(styleSpec.pointRadius * 2.35, 12, 56, 18),
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
              updateTriggers: {
                getColor: [styleSpec.point, layerOpacity, attributeColorSpec],
                getSize: [styleSpec.pointRadius],
                getText: [styleSpec.markerSymbol],
              },
            }),
          );
        }
      }

      if (isImageStyle && styleSpec.customMarkerDataUrl) {
        const markerPoints = getLayerImageMarkerPoints(layer, styleSpec, attributeColorSpec);
        if (markerPoints.length > 0) {
          deckLayers.push(
            new IconLayer<DeckImageMarkerPoint>({
              id: `${layerId}-marker-image`,
              data: markerPoints,
              pickable: false,
              billboard: true,
              sizeUnits: "pixels",
              getPosition: (point) => point.position,
              getIcon: () => ({
                url: styleSpec.customMarkerDataUrl!,
                width: 128,
                height: 128,
                anchorY: 128,
              }),
              getColor: (point) => withAlpha(point.color, Math.round(255 * layerOpacity)),
              getSize: clampInteger(styleSpec.pointRadius * 3.2, 14, 96, 28),
              updateTriggers: {
                getIcon: [styleSpec.customMarkerDataUrl],
                getColor: [styleSpec.point, layerOpacity, attributeColorSpec],
                getSize: [styleSpec.pointRadius],
              },
            }),
          );
        }
      }
      continue;
    }

    if (layer.layerType === "scatterplot") {
      const scatterPoints = extractScatterPoints(layer.inlineData);
      if (scatterPoints.length > 0) {
        const isRingStyle = styleSpec.markerStyle === "ring";
        const isGlowStyle = styleSpec.markerStyle === "glow";
        const isSymbolStyle = styleSpec.markerStyle === "symbol";
        const isImageStyle = styleSpec.markerStyle === "image" && Boolean(styleSpec.customMarkerDataUrl);
        deckLayers.push(
          new ScatterplotLayer<DeckPoint>({
            id: layerId,
            data: scatterPoints,
            pickable: true,
            stroked: true,
            filled: true,
            opacity: layerOpacity,
            radiusUnits: "pixels",
            radiusMinPixels: isGlowStyle ? styleSpec.pointRadius + 2 : styleSpec.pointRadius,
            getPosition: (point) => point.position,
            getRadius: (point) =>
              Math.max(isGlowStyle ? styleSpec.pointRadius + 2 : styleSpec.pointRadius, Math.sqrt(Math.max(1, point.weight)) * styleSpec.pointRadius),
            getFillColor: (point) =>
              withAlpha(
                getAttributeColor({ properties: point.properties }, attributeColorSpec, styleSpec.point),
                isSymbolStyle || isImageStyle ? 0 : isRingStyle ? 70 : isGlowStyle ? 155 : 180,
              ),
            getLineColor: (point) => withAlpha(getAttributeColor({ properties: point.properties }, attributeColorSpec, styleSpec.point), 220),
            lineWidthMinPixels: isRingStyle ? 2.4 : isGlowStyle ? 1.6 : 1.2,
            updateTriggers: {
              getRadius: [styleSpec.pointRadius, styleSpec.markerStyle],
              getFillColor: [styleSpec.point, styleSpec.markerStyle, attributeColorSpec],
              getLineColor: [styleSpec.point, attributeColorSpec],
            },
          }),
        );

        const labelPoints = getLayerLabelPoints(layer);
        if (labelPoints.length > 0) {
          deckLayers.push(
            new TextLayer<DeckLabelPoint>({
              id: `${layerId}-labels`,
              data: labelPoints,
              pickable: false,
              billboard: true,
              fontWeight: 600,
              sizeUnits: "pixels",
              getPosition: (point) => point.position,
              getText: (point) => point.text,
              getColor: withAlpha(styleSpec.label, Math.round(255 * layerOpacity)),
              getSize: styleSpec.labelSize,
              getTextAnchor: "middle",
              getAlignmentBaseline: "bottom",
              updateTriggers: {
                getColor: [styleSpec.label, layerOpacity],
                getSize: [styleSpec.labelSize],
              },
            }),
          );
        }

        if (isSymbolStyle) {
          const symbol = getLayerMarkerSymbol(styleSpec);
          deckLayers.push(
            new TextLayer<DeckPoint>({
              id: `${layerId}-marker-symbol`,
              data: scatterPoints,
              pickable: false,
              billboard: true,
              sizeUnits: "pixels",
              getPosition: (point) => point.position,
              getText: () => symbol,
              getColor: (point) =>
                withAlpha(getAttributeColor({ properties: point.properties }, attributeColorSpec, styleSpec.point), Math.round(255 * layerOpacity)),
              getSize: clampInteger(styleSpec.pointRadius * 2.35, 12, 56, 18),
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
              updateTriggers: {
                getText: [symbol],
                getColor: [styleSpec.point, layerOpacity, attributeColorSpec],
                getSize: [styleSpec.pointRadius],
              },
            }),
          );
        }

        if (isImageStyle && styleSpec.customMarkerDataUrl) {
          deckLayers.push(
            new IconLayer<DeckPoint>({
              id: `${layerId}-marker-image`,
              data: scatterPoints,
              pickable: false,
              billboard: true,
              sizeUnits: "pixels",
              getPosition: (point) => point.position,
              getIcon: () => ({
                url: styleSpec.customMarkerDataUrl!,
                width: 128,
                height: 128,
                anchorY: 128,
              }),
              getColor: (point) =>
                withAlpha(getAttributeColor({ properties: point.properties }, attributeColorSpec, styleSpec.point), Math.round(255 * layerOpacity)),
              getSize: clampInteger(styleSpec.pointRadius * 3.2, 14, 96, 28),
              updateTriggers: {
                getIcon: [styleSpec.customMarkerDataUrl],
                getColor: [styleSpec.point, layerOpacity, attributeColorSpec],
                getSize: [styleSpec.pointRadius],
              },
            }),
          );
        }
        continue;
      }

      if (layer.sourceUrl) {
        deckLayers.push(
          new GeoJsonLayer({
            id: `${layerId}-fallback`,
            data: layer.sourceUrl,
            pickable: true,
            pointType: "circle",
            opacity: layerOpacity,
            getPointRadius: styleSpec.pointRadius,
            pointRadiusUnits: "pixels",
            getFillColor: withAlpha(styleSpec.point, 180),
            updateTriggers: {
              getPointRadius: [styleSpec.pointRadius],
              getFillColor: [styleSpec.point],
            },
          } as never),
        );
      }
      continue;
    }

    const tilesetLayer = buildDeckTilesetLayer({
      layer,
      layerId,
      layerOpacity,
      styleColors: {
        fill: styleSpec.fill,
        line: styleSpec.line,
      },
    });
    if (tilesetLayer) {
      deckLayers.push(tilesetLayer);
    }
  }

  return deckLayers;
};

type BoundsAccumulator = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const updateBounds = (bounds: BoundsAccumulator, longitude: number, latitude: number) => {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return;
  }

  bounds.minLng = Math.min(bounds.minLng, longitude);
  bounds.minLat = Math.min(bounds.minLat, latitude);
  bounds.maxLng = Math.max(bounds.maxLng, longitude);
  bounds.maxLat = Math.max(bounds.maxLat, latitude);
};

const walkCoordinates = (value: unknown, bounds: BoundsAccumulator) => {
  if (!isArrayOrTypedArray(value) || value.length === 0) {
    return;
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    updateBounds(bounds, Number(value[0]), Number(value[1]));
    return;
  }

  for (const child of value) {
    walkCoordinates(child, bounds);
  }
};

const collectGeometryBounds = (geometryValue: unknown, bounds: BoundsAccumulator) => {
  const geometry = asRecord(geometryValue);
  if (!geometry || typeof geometry.type !== "string") {
    return;
  }

  if (geometry.type === "GeometryCollection") {
    const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
    for (const subGeometry of geometries) {
      collectGeometryBounds(subGeometry, bounds);
    }
    return;
  }

  walkCoordinates(geometry.coordinates, bounds);
};

const collectGeoJsonBounds = (geojsonValue: unknown, bounds: BoundsAccumulator) => {
  const geojson = asRecord(geojsonValue);
  if (!geojson || typeof geojson.type !== "string") {
    return;
  }

  if (geojson.type === "FeatureCollection") {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    for (const feature of features) {
      const featureRecord = asRecord(feature);
      collectGeometryBounds(featureRecord?.geometry, bounds);
    }
    return;
  }

  if (geojson.type === "Feature") {
    collectGeometryBounds(geojson.geometry, bounds);
    return;
  }

  collectGeometryBounds(geojson, bounds);
};

export const getGeoJsonLngLatBounds = (geojsonValue: unknown): maplibregl.LngLatBoundsLike | null => {
  const bounds: BoundsAccumulator = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };

  collectGeoJsonBounds(geojsonValue, bounds);

  const hasBounds =
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLng) &&
    Number.isFinite(bounds.maxLat);
  if (!hasBounds) {
    return null;
  }

  if (bounds.minLng === bounds.maxLng && bounds.minLat === bounds.maxLat) {
    const delta = 0.03;
    return [
      [bounds.minLng - delta, bounds.minLat - delta],
      [bounds.maxLng + delta, bounds.maxLat + delta],
    ];
  }

  return [
    [bounds.minLng, bounds.minLat],
    [bounds.maxLng, bounds.maxLat],
  ];
};

export const getLayerLngLatBounds = (layer: GeoPlusLayerItem): maplibregl.LngLatBoundsLike | null => getGeoJsonLngLatBounds(layer.inlineData);

export const getDeckLayerTooltip = (info: Record<string, unknown>, appLayers: GeoPlusLayerItem[]) => {
  const object = info?.object as Record<string, unknown> | undefined;
  if (!object || !info.layer) {
    return null;
  }

  // Find corresponding app layer
  const layerInfo = info.layer as { id: string };
  const layerId = layerInfo.id.replace(/^user-/, "");
  const appLayer = appLayers.find((l) => toSafeLayerId(l.id) === layerId);

  // If layer explicitly disables tooltips, return null
  if (appLayer?.interactionConfig?.tooltipEnabled === false) {
    return null;
  }

  const properties = asRecord(object.properties) ?? asRecord(object) ?? {};

  // If specific fields are requested, build a multi-line tooltip
  const tooltipFields = appLayer?.interactionConfig?.tooltipFields;
  if (tooltipFields && tooltipFields.length > 0) {
    const lines = tooltipFields.map((field) => {
      const val = properties[field];
      return `${humanizeColumnName(field)}: ${val ?? "N/A"}`;
    });
    return { text: lines.join("\n") };
  }

  // Default fallback behavior
  if (typeof object.magnitude === "number" && typeof object.category === "string") {
    return {
      text: `${object.category.toUpperCase()}\nMagnitude: ${object.magnitude.toFixed(1)}`,
    };
  }

  const title = properties.name ?? properties.title;
  if (typeof title === "string" && title.length > 0) {
    return { text: title };
  }

  return null;
};
