import * as maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";

const isFeatureCollection = (value: unknown): value is GeoJSON.FeatureCollection =>
  Boolean(value) && typeof value === "object" && (value as { type?: string }).type === "FeatureCollection";

export const mapFeatureToGeoJsonFeature = (feature: maplibregl.MapGeoJSONFeature): GeoJSON.Feature | null => {
  if (!feature.geometry) {
    return null;
  }
  return {
    type: "Feature",
    geometry: feature.geometry as GeoJSON.Geometry,
    properties: feature.properties ?? {},
  };
};

export const deckObjectToGeoJsonFeature = (object: Record<string, unknown>): GeoJSON.Feature | null => {
  if (isFeatureCollection(object)) {
    return object.features[0] ?? null;
  }

  const maybeFeature = object as {
    type?: string;
    geometry?: GeoJSON.Geometry;
    properties?: Record<string, unknown>;
    position?: [number, number];
  };

  if (maybeFeature.type === "Feature" && maybeFeature.geometry) {
    return {
      type: "Feature",
      geometry: maybeFeature.geometry,
      properties: maybeFeature.properties ?? {},
    };
  }

  if (Array.isArray(maybeFeature.position) && maybeFeature.position.length >= 2) {
    const longitude = Number(maybeFeature.position[0]);
    const latitude = Number(maybeFeature.position[1]);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        properties: maybeFeature.properties ?? object,
      };
    }
  }

  return null;
};

const toPrimitivePropertyRecord = (value: unknown): Record<string, string | number | boolean | null | unknown[]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const properties = value as Record<string, unknown>;
  const normalized: Record<string, string | number | boolean | null | unknown[]> = {};
  for (const [key, candidate] of Object.entries(properties)) {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      typeof candidate === "boolean" ||
      (key === "media" && Array.isArray(candidate))
    ) {
      normalized[key] = candidate;
    }
  }
  return normalized;
};

export const normalizeDrawFeatureCollectionForLayer = (source: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => {
  const normalizedFeatures: GeoJSON.Feature[] = [];

  source.features.forEach((feature) => {
    if (!feature.geometry) {
      return;
    }

    // Only keep user-defined primitive properties.
    // We strip out internal Mapbox Draw properties (like 'active', 'mode')
    // and stop injecting hardcoded draw_source, vertex_count, area_sqm, etc.
    const userProperties = toPrimitivePropertyRecord(feature.properties);
    
    // Explicitly delete mapbox-gl-draw internal state properties if they leaked through
    delete userProperties.active;
    delete userProperties.mode;

    let workingFeature: GeoJSON.Feature = feature;
    try {
      workingFeature = turf.cleanCoords(feature as GeoJSON.Feature, { mutate: false }) as GeoJSON.Feature;
    } catch {
      // Keep original feature if cleanup fails.
    }

    normalizedFeatures.push({
      ...workingFeature,
      properties: userProperties,
    });
  });

  return {
    type: "FeatureCollection",
    features: normalizedFeatures,
  };
};

export const getDeckClickLngLat = (map: maplibregl.Map, info: Record<string, unknown>, object: Record<string, unknown>): [number, number] | null => {
  const coordinate = info.coordinate as [number, number] | undefined;
  if (Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])) {
    return coordinate;
  }

  const x = Number(info.x);
  const y = Number(info.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const lngLat = map.unproject([x, y]);
    return [lngLat.lng, lngLat.lat];
  }

  const fallbackFeature = deckObjectToGeoJsonFeature(object);
  if (fallbackFeature?.geometry?.type === "Point" && Array.isArray(fallbackFeature.geometry.coordinates)) {
    const [lng, lat] = fallbackFeature.geometry.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  return null;
};

export const supportsFeatureInteractions = (layer: GeoPlusLayerItem | undefined) => {
  if (!layer) {
    return false;
  }
  return layer.layerType === "geojson" || layer.layerType === "scatterplot" || layer.layerType === "mvt";
};
