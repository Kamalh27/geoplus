import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { isGeoJsonFeatureCollection } from "@/lib/geoplus/duckdb-spatial-analytics";

export const getLayerSourceFeatureCollection = (layer: GeoPlusLayerItem): GeoJSON.FeatureCollection | null => {
  if (isGeoJsonFeatureCollection(layer.rawInlineData)) {
    return layer.rawInlineData;
  }
  if (isGeoJsonFeatureCollection(layer.inlineData)) {
    return layer.inlineData;
  }
  return null;
};

const toGeometryFamily = (geometryType: string): "Point" | "Line" | "Polygon" | null => {
  if (geometryType === "Point" || geometryType === "MultiPoint") {
    return "Point";
  }
  if (geometryType === "LineString" || geometryType === "MultiLineString") {
    return "Line";
  }
  if (geometryType === "Polygon" || geometryType === "MultiPolygon") {
    return "Polygon";
  }
  return null;
};

export const getLayerGeometryFamilies = (layer: GeoPlusLayerItem): string[] => {
  const families = new Set<string>();
  const candidates = [layer.rawInlineData, layer.inlineData];

  for (const candidate of candidates) {
    if (!isGeoJsonFeatureCollection(candidate)) {
      continue;
    }
    for (const feature of candidate.features) {
      const geometryType = feature?.geometry?.type;
      if (!geometryType) {
        continue;
      }
      const family = toGeometryFamily(geometryType);
      if (family) {
        families.add(family);
      }
    }
  }

  if (layer.layerType === "scatterplot") {
    families.add("Point");
  }

  const orderedFamilies = ["Point", "Line", "Polygon"];
  return orderedFamilies.filter((family) => families.has(family));
};
