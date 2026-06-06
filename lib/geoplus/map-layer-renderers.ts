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
import { syncMapLibreTilesetLayer } from "@/lib/geoplus/tilesets/maplibre-tile-layer-scripts";

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
    fill: [46, 125, 78],
    line: [11, 79, 54],
    point: [52, 211, 153],
    label: [8, 63, 43],
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
    rasterLayerId: `${MAPLIBRE_LAYER_PREFIX}${safeId}-raster`,
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

const getScaleAwareDefaultPointRadius = (layer: GeoPlusLayerItem) => {
  if (layer.uploadScale === "large") {
    return 2.25;
  }
  if (layer.uploadScale === "medium") {
    return 3.25;
  }
  return 5;
};

const getScaleAwareDefaultLineWidth = (layer: GeoPlusLayerItem) => {
  if (layer.uploadScale === "large") {
    return 1.25;
  }
  if (layer.uploadScale === "medium") {
    return 1.75;
  }
  return 2;
};


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
    lineWidth: clampNumber(config?.lineWidth, 0.5, 12, getScaleAwareDefaultLineWidth(layer)),
    pointRadius: clampNumber(config?.pointRadius, 2, 24, getScaleAwareDefaultPointRadius(layer)),
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
// MVT stays in deck.gl — MapLibre requires a source-layer name we don't have at layer-add time.
const isDeckTileLayerType = (layerType: GeoPlusLayerType) => layerType === "mvt";
const isMapLibreRasterTileType = (layerType: GeoPlusLayerType) => layerType === "raster-tile" || layerType === "wms";
const isMapLibreGeoJsonLayerType = (layerType: GeoPlusLayerType) => layerType === "geojson" || layerType === "scatterplot";
const usesImageMarkerStyle = (styleSpec: LayerStyleSpec) =>
  styleSpec.markerStyle === "image" && Boolean(styleSpec.customMarkerDataUrl);
const getInteractionFieldLabel = (layer: GeoPlusLayerItem, field: string) =>
  layer.interactionConfig?.fieldDisplayNames?.[field]?.trim() || humanizeColumnName(field);

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

const getScatterAggregationTarget = (layer: GeoPlusLayerItem, pointCount: number) => {
  if (layer.uploadScale === "large") {
    return Math.min(pointCount, 3500);
  }
  if (layer.uploadScale === "medium") {
    return Math.min(pointCount, 9000);
  }
  return null;
};

const aggregateScatterPoints = (points: DeckPoint[], targetBucketCount: number): DeckPoint[] => {
  if (points.length === 0 || points.length <= targetBucketCount) {
    return points;
  }

  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const [lng, lat] = point.position;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    return points;
  }

  const spanLng = Math.max(maxLng - minLng, 1e-6);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const sideBuckets = Math.max(1, Math.ceil(Math.sqrt(targetBucketCount)));
  const lngStep = Math.max(spanLng / sideBuckets, 1e-5);
  const latStep = Math.max(spanLat / sideBuckets, 1e-5);

  type AggregatedScatterPoint = {
    lngSum: number;
    latSum: number;
    weightSum: number;
    count: number;
    properties: Record<string, unknown>;
  };

  const buckets = new Map<string, AggregatedScatterPoint>();

  for (const point of points) {
    const [lng, lat] = point.position;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }

    const bucketLng = Math.floor((lng - minLng) / lngStep);
    const bucketLat = Math.floor((lat - minLat) / latStep);
    const bucketKey = `${bucketLng}:${bucketLat}`;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.lngSum += lng;
      existing.latSum += lat;
      existing.weightSum += Math.max(1, Number.isFinite(point.weight) ? point.weight : 1);
      existing.count += 1;
      continue;
    }

    buckets.set(bucketKey, {
      lngSum: lng,
      latSum: lat,
      weightSum: Math.max(1, Number.isFinite(point.weight) ? point.weight : 1),
      count: 1,
      properties: { ...point.properties },
    });
  }

  return [...buckets.values()].map((bucket) => ({
    position: [bucket.lngSum / bucket.count, bucket.latSum / bucket.count],
    weight: bucket.weightSum,
    properties: {
      ...bucket.properties,
      __point_count: bucket.count,
    },
  }));
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

/**
 * Returns true when the feature collection contains at least one Polygon or
 * MultiPolygon feature. Used to decide whether to enable polygon fill in
 * deck.gl GeoJsonLayer — enabling fill for pure line/point data causes
 * transparent-polygon colour accumulation that renders as false banding.
 */
const hasPolygonFeatures = (value: unknown): boolean => {
  const geojson = asRecord(value);
  if (!geojson || !Array.isArray(geojson.features)) return false;
  return (geojson.features as unknown[]).some((f) => {
    const feature = asRecord(f);
    const geometry = asRecord(feature?.geometry);
    if (!geometry || typeof geometry.type !== "string") return false;
    return geometry.type === "Polygon" || geometry.type === "MultiPolygon" || geometry.type === "GeometryCollection";
  });
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
      if (uniqueValues.size >= 512) {
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

// ─── Surgical layer sync ──────────────────────────────────────────────────────
//
// Previously this function removed every geoplus-prefixed layer and source on
// each render call, then rebuilt them from scratch.  That caused two problems:
//
//  1. Raster layers (COG, PMTiles, MBTiles) re-fetched all tiles every render
//     cycle → visible horizontal banding / flickering during the reload.
//  2. Vector sources lost their cached tile data on every style update.
//
// The new implementation tracks which layer IDs *should* be present and
// removes only those that are no longer needed, then adds/updates the rest.

const buildExpectedLayerIds = (layers: GeoPlusLayerItem[]): Set<string> => {
  const ids = new Set<string>();
  for (const layer of layers) {
    if (!layer.visible) continue;
    // These manage their own IDs internally.
    if (isCogMapLibreLayer(layer) || isPmtilesMapLibreLayer(layer) || isMbtilesMapLibreLayer(layer) || isZarrMapLibreLayer(layer)) {
      continue;
    }
    // MVT renders via deck.gl.
    if (isDeckTileLayerType(layer.layerType)) continue;

    const ids_ = getManagedMapLibreIds(layer.id);

    if (isMapLibreRasterTileType(layer.layerType)) {
      ids.add(ids_.rasterLayerId);
      continue;
    }

    if (isMapLibreGeoJsonLayerType(layer.layerType)) {
      const styleSpec = getLayerStyleSpec(layer);
      // Image marker style renders via deck.gl IconLayer.
      if (usesImageMarkerStyle(styleSpec)) continue;
      ids.add(ids_.fillLayerId);
      ids.add(ids_.lineLayerId);
      ids.add(ids_.pointLayerId);
      ids.add(ids_.markerSymbolLayerId);
      ids.add(ids_.labelLayerId);
    }
  }
  return ids;
};

const removeStaleMapLibreLayers = (map: maplibregl.Map, expectedLayerIds: Set<string>) => {
  const style = map.getStyle();

  // Remove layers (in reverse order to avoid dangling source references).
  const staleLayers = [...(style.layers ?? [])]
    .reverse()
    .filter((l) => l.id.startsWith(MAPLIBRE_LAYER_PREFIX) && !expectedLayerIds.has(l.id));

  for (const l of staleLayers) {
    if (map.getLayer(l.id)) {
      map.removeLayer(l.id);
    }
  }

  // Remove sources that no longer have any associated layers.
  const remainingLayerSources = new Set(
    (map.getStyle().layers ?? [])
      .filter((l) => "source" in l)
      .map((l) => (l as { source?: string }).source)
      .filter(Boolean),
  );
  for (const sourceId of Object.keys(style.sources ?? {})) {
    if (sourceId.startsWith(MAPLIBRE_LAYER_PREFIX) && !remainingLayerSources.has(sourceId)) {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }
  }
};

export const syncMapLibreUserLayers = (map: maplibregl.Map, layers: GeoPlusLayerItem[]) => {
  if (!map.isStyleLoaded()) {
    return;
  }

  const expectedLayerIds = buildExpectedLayerIds(layers);
  removeStaleMapLibreLayers(map, expectedLayerIds);

  for (const layer of layers) {
    if (!layer.visible) {
      continue;
    }

    // ── Specialized tileset sync functions ───────────────────────────────────

    if (isCogMapLibreLayer(layer)) {
      syncCogMapLibreLayer({ map, layer, layerOpacity: getLayerOpacity(layer) });
      continue;
    }
    if (isPmtilesMapLibreLayer(layer)) {
      const styleSpec = getLayerStyleSpec(layer);
      void syncPmtilesMapLibreLayer({
        map, layer, layerOpacity: getLayerOpacity(layer),
        styleColors: { fill: styleSpec.fill, line: styleSpec.line, point: styleSpec.point },
      });
      continue;
    }
    if (isMbtilesMapLibreLayer(layer)) {
      const styleSpec = getLayerStyleSpec(layer);
      void syncMbtilesMapLibreLayer({
        map, layer, layerOpacity: getLayerOpacity(layer),
        styleColors: { fill: styleSpec.fill, line: styleSpec.line, point: styleSpec.point },
      });
      continue;
    }
    if (isZarrMapLibreLayer(layer)) {
      void syncZarrMapLibreLayer({ map, layer, layerOpacity: getLayerOpacity(layer) });
      continue;
    }

    // MVT renders via deck.gl.
    if (isDeckTileLayerType(layer.layerType)) continue;

    const ids = getManagedMapLibreIds(layer.id);
    const layerOpacity = getLayerOpacity(layer);

    // ── Raster tile layers (raster-tile, wms) ────────────────────────────────

    if (isMapLibreRasterTileType(layer.layerType)) {
      syncMapLibreTilesetLayer({ map, layer, sourceId: ids.sourceId, rasterLayerId: ids.rasterLayerId, layerOpacity });
      continue;
    }

    // ── GeoJSON / scatterplot layers ─────────────────────────────────────────

    if (isMapLibreGeoJsonLayerType(layer.layerType)) {
      const styleSpec = getLayerStyleSpec(layer);
      // Image marker style uses deck.gl IconLayer — skip here.
      if (usesImageMarkerStyle(styleSpec)) continue;

      const attributeColorSpec = buildAttributeColorSpec(layer, styleSpec);
      const data = layer.inlineData ?? layer.sourceUrl;
      if (!data) {
        continue;
      }

      const isRingStyle = styleSpec.markerStyle === "ring";
      const isGlowStyle = styleSpec.markerStyle === "glow";
      const isSymbolStyle = styleSpec.markerStyle === "symbol";
      const markerBaseRadius = styleSpec.pointRadius;
      const markerRadius = isGlowStyle ? markerBaseRadius + 3 : isRingStyle ? markerBaseRadius + 1 : markerBaseRadius;
      const markerOpacity = isSymbolStyle ? 0 : isRingStyle ? 0.18 * layerOpacity : isGlowStyle ? 0.62 * layerOpacity : layerOpacity;
      const markerStrokeWidth = isRingStyle ? 2.4 : isGlowStyle ? 1.6 : 1.2;
      const markerStrokeColor = getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.point);
      const fillColorExpr = getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.fill);
      const lineColorExpr = getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.line);
      const pointColorExpr = getMapLibreAttributeColorExpression(attributeColorSpec, styleSpec.point);

      // Source — add once; update data if already present.
      if (!map.getSource(ids.sourceId)) {
        map.addSource(ids.sourceId, {
          type: "geojson",
          data: data as string | GeoJSON.GeoJSON,
        });
      } else {
        (map.getSource(ids.sourceId) as maplibregl.GeoJSONSource).setData(
          data as string | GeoJSON.GeoJSON,
        );
      }

      // Fill layer
      if (!map.getLayer(ids.fillLayerId)) {
        map.addLayer({
          id: ids.fillLayerId,
          type: "fill",
          source: ids.sourceId,
          paint: {
            "fill-color": fillColorExpr,
            "fill-opacity": layerOpacity,
          },
        });
      } else {
        map.setPaintProperty(ids.fillLayerId, "fill-color", fillColorExpr);
        map.setPaintProperty(ids.fillLayerId, "fill-opacity", layerOpacity);
      }

      // Line layer
      if (!map.getLayer(ids.lineLayerId)) {
        map.addLayer({
          id: ids.lineLayerId,
          type: "line",
          source: ids.sourceId,
          paint: {
            "line-color": lineColorExpr,
            "line-width": styleSpec.lineWidth,
            "line-opacity": 0.9 * layerOpacity,
          },
        });
      } else {
        map.setPaintProperty(ids.lineLayerId, "line-color", lineColorExpr);
        map.setPaintProperty(ids.lineLayerId, "line-width", styleSpec.lineWidth);
        map.setPaintProperty(ids.lineLayerId, "line-opacity", 0.9 * layerOpacity);
      }

      // Circle / point layer
      if (!map.getLayer(ids.pointLayerId)) {
        map.addLayer({
          id: ids.pointLayerId,
          type: "circle",
          source: ids.sourceId,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": markerRadius,
            "circle-color": pointColorExpr,
            "circle-opacity": markerOpacity,
            "circle-stroke-width": markerStrokeWidth,
            "circle-stroke-color": markerStrokeColor,
            "circle-blur": isGlowStyle ? 0.34 : 0,
          },
        });
      } else {
        map.setPaintProperty(ids.pointLayerId, "circle-radius", markerRadius);
        map.setPaintProperty(ids.pointLayerId, "circle-color", pointColorExpr);
        map.setPaintProperty(ids.pointLayerId, "circle-opacity", markerOpacity);
        map.setPaintProperty(ids.pointLayerId, "circle-stroke-width", markerStrokeWidth);
        map.setPaintProperty(ids.pointLayerId, "circle-stroke-color", markerStrokeColor);
        map.setPaintProperty(ids.pointLayerId, "circle-blur", isGlowStyle ? 0.34 : 0);
      }

      // Symbol marker (only for symbol style)
      if (isSymbolStyle) {
        if (!map.getLayer(ids.markerSymbolLayerId)) {
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
              "text-color": pointColorExpr,
              "text-opacity": 0.92 * layerOpacity,
              "text-halo-color": "rgba(15,23,42,0.78)",
              "text-halo-width": 1.1,
            },
          });
        } else {
          map.setPaintProperty(ids.markerSymbolLayerId, "text-color", pointColorExpr);
          map.setPaintProperty(ids.markerSymbolLayerId, "text-opacity", 0.92 * layerOpacity);
        }
      } else if (map.getLayer(ids.markerSymbolLayerId)) {
        map.removeLayer(ids.markerSymbolLayerId);
      }

      // Label layer
      const labelField = layer.labelField?.trim();
      if (layer.labelEnabled && labelField) {
        if (!map.getLayer(ids.labelLayerId)) {
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
        } else {
          map.setPaintProperty(ids.labelLayerId, "text-color", rgbToCss(styleSpec.label));
          map.setPaintProperty(ids.labelLayerId, "text-opacity", layerOpacity);
        }
      } else if (map.getLayer(ids.labelLayerId)) {
        map.removeLayer(ids.labelLayerId);
      }

      continue;
    }
  }
};

export const buildDeckUserLayers = (layers: GeoPlusLayerItem[]): DeckLayer[] => {
  const deckLayers: DeckLayer[] = [];

  for (const layer of layers) {
    if (!layer.visible) continue;
    if (isPmtilesMapLibreLayer(layer) || isCogMapLibreLayer(layer) || isMbtilesMapLibreLayer(layer) || isZarrMapLibreLayer(layer)) continue;

    const layerId = `user-${toSafeLayerId(layer.id)}`;
    const styleSpec = getLayerStyleSpec(layer);
    const layerOpacity = getLayerOpacity(layer);

    // MVT tiles → deck.gl (MapLibre requires a source-layer name not available at add time).
    if (isDeckTileLayerType(layer.layerType)) {
      const tilesetLayer = buildDeckTilesetLayer({
        layer, layerId, layerOpacity,
        styleColors: { fill: styleSpec.fill, line: styleSpec.line },
      });
      if (tilesetLayer) deckLayers.push(tilesetLayer);
      continue;
    }

    // All other user layers: only image marker style stays in deck.gl (needs IconLayer).
    // Everything else (solid, ring, glow, symbol) is handled by MapLibre.
    if (!isMapLibreGeoJsonLayerType(layer.layerType) || !usesImageMarkerStyle(styleSpec)) continue;

    const attributeColorSpec = buildAttributeColorSpec(layer, styleSpec);

    if (layer.layerType === "geojson") {
      const data = layer.inlineData ?? layer.sourceUrl;
      if (!data) continue;

      // For pure line/point data (e.g. KML scan-lines), enabling fill causes
      // transparent-polygon alpha to accumulate across overlapping features,
      // producing false horizontal green banding across the map.
      const dataHasPolygons = typeof data === "string" ? false : hasPolygonFeatures(data);
      const lineAlpha = Math.round(230 * layerOpacity);

      // GeoJsonLayer handles polygon fill + line rendering; points are transparent (IconLayer handles them).
      deckLayers.push(
        new GeoJsonLayer({
          id: layerId,
          data,
          pickable: true,
          stroked: true,
          filled: dataHasPolygons,
          pointType: "circle",
          opacity: 1,
          getFillColor: (feature: unknown) =>
            withAlpha(
              getAttributeColor(feature, attributeColorSpec, styleSpec.fill),
              Math.round(255 * layerOpacity),
            ),
          getLineColor: (feature: unknown) =>
            withAlpha(getAttributeColor(feature, attributeColorSpec, styleSpec.line), lineAlpha),
          getPointFillColor: [0, 0, 0, 0],
          lineWidthUnits: "pixels",
          pointRadiusUnits: "pixels",
          lineWidthMinPixels: styleSpec.lineWidth,
          pointRadiusMinPixels: styleSpec.pointRadius,
          getLineWidth: styleSpec.lineWidth,
          getPointRadius: styleSpec.pointRadius,
          updateTriggers: {
            getFillColor: [styleSpec.fill, layerOpacity, attributeColorSpec],
            getLineColor: [styleSpec.line, layerOpacity, attributeColorSpec],
            getLineWidth: [styleSpec.lineWidth],
            getPointRadius: [styleSpec.pointRadius],
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
            fontFamily: "system-ui, sans-serif",
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
      continue;
    }

    if (layer.layerType === "scatterplot") {
      const rawScatterPoints = extractScatterPoints(layer.inlineData ?? layer.rawInlineData);
      const scatterPoints =
        rawScatterPoints.length < 2
          ? rawScatterPoints
          : aggregateScatterPoints(rawScatterPoints, getScatterAggregationTarget(layer, rawScatterPoints.length) ?? rawScatterPoints.length);

      if (scatterPoints.length === 0) continue;

      // ScatterplotLayer with transparent fill acts as a halo/pickable background for image icons.
      deckLayers.push(
        new ScatterplotLayer<DeckPoint>({
          id: layerId,
          data: scatterPoints,
          pickable: true,
          stroked: true,
          filled: true,
          opacity: 1,
          radiusUnits: "pixels",
          radiusMinPixels: styleSpec.pointRadius,
          getPosition: (point) => point.position,
          getRadius: (point) =>
            Math.max(styleSpec.pointRadius, Math.sqrt(Math.max(1, point.weight)) * styleSpec.pointRadius),
          getFillColor: [0, 0, 0, 0],
          getLineColor: (point) =>
            withAlpha(getAttributeColor({ properties: point.properties }, attributeColorSpec, styleSpec.point), Math.round(220 * layerOpacity)),
          lineWidthMinPixels: 1.2,
          updateTriggers: {
            getRadius: [styleSpec.pointRadius],
            getLineColor: [styleSpec.point, layerOpacity, attributeColorSpec],
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
            fontFamily: "system-ui, sans-serif",
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
      continue;
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

export const getLayerLngLatBounds = (layer: GeoPlusLayerItem): maplibregl.LngLatBoundsLike | null => getGeoJsonLngLatBounds(layer.inlineData ?? layer.rawInlineData);

export const getDeckLayerTooltip = (info: Record<string, unknown>, appLayers: GeoPlusLayerItem[]) => {
  const object = info?.object as Record<string, unknown> | undefined;
  if (!object || !info.layer) {
    return null;
  }

  // Find corresponding app layer
  const layerInfo = info.layer as { id: string };
  // Remove 'user-' prefix and split by '-' to handle DeckGL sub-layers like '-points' or '-polygons'
  const rawId = layerInfo.id.replace(/^user-/, "");
  const appLayer = appLayers.find((l) => {
    const safeId = toSafeLayerId(l.id);
    return rawId === safeId || rawId.startsWith(`${safeId}-`);
  });

  if (!appLayer) {
    return null;
  }

  // If layer explicitly disables tooltips, return null
  if (appLayer.interactionConfig?.tooltipEnabled === false) {
    return null;
  }

  const properties = asRecord(object.properties) ?? asRecord(object) ?? {};

  // If specific fields are requested, build a multi-line tooltip
  const tooltipFields = appLayer?.interactionConfig?.tooltipFields;
  if (tooltipFields && tooltipFields.length > 0) {
    const lines = tooltipFields.map((field) => {
      const val = properties[field];
      return `${getInteractionFieldLabel(appLayer, field)}: ${val ?? "N/A"}`;
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
