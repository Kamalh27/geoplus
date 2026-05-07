import type { GeoPlusLayerItem, GeoPlusColorRamp } from "@/components/geoplus/types";
import { isGeoJsonFeatureCollection } from "@/lib/geoplus/duckdb-spatial-analytics";

export const COLOR_RAMPS: Record<Exclude<GeoPlusColorRamp, "custom">, string[]> = {
  vivid: ["#22c55e", "#0ea5e9", "#f97316", "#8b5cf6", "#e11d48", "#06b6d4", "#f59e0b", "#10b981"],
  earth: ["#4d7c0f", "#6b8e23", "#b45309", "#92400e", "#854d0e", "#166534", "#57534e", "#9a3412"],
  pastel: ["#93c5fd", "#c4b5fd", "#f9a8d4", "#fdba74", "#86efac", "#67e8f9", "#fcd34d", "#a7f3d0"],
  magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
  inferno: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
  plasma: ["#0d0887", "#5c01a6", "#9c179e", "#cc4778", "#ed7953", "#f8d624"],
  viridis: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
  ylgnbu: ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#1d91c0", "#225ea8", "#0c2c84"],
  orrd: ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59", "#ef6548", "#d7301f", "#b30000", "#7f0000"],
  coolwarm: ["#3b4cc0", "#6788ee", "#9cc5e9", "#d9d9d9", "#f6a97a", "#e26952", "#b40426"],
  spring: ["#ff00ff", "#ff33cc", "#ff6699", "#ff9966", "#ffcc33", "#ffff00"],
  summer: ["#008066", "#339966", "#66b366", "#99cc66", "#cce666", "#ffff66"],
  autumn: ["#ff0000", "#ff3300", "#ff6600", "#ff9900", "#ffcc00", "#ffff00"],
  winter: ["#0000ff", "#0033e6", "#0066cc", "#0099b3", "#00cc99", "#00ff80"],
  jet: ["#00007f", "#0000ff", "#007fff", "#00ffff", "#7fff7f", "#ffff00", "#ff7f00", "#ff0000", "#7f0000"],
  bone: ["#000000", "#242435", "#48485a", "#6c7482", "#90a0aa", "#b4cbd2", "#d8e6eb", "#ffffff"],
  copper: ["#000000", "#332014", "#664129", "#99613d", "#cc8252", "#ffb27f"],
};

export const getLayerColorRampColors = (layer: GeoPlusLayerItem): string[] => {
  if (layer.styleConfig?.colorRamp === "custom" && layer.styleConfig?.customColorRamp && layer.styleConfig.customColorRamp.length > 0) {
    return layer.styleConfig.customColorRamp;
  }
  const rampId = layer.styleConfig?.colorRamp && layer.styleConfig.colorRamp !== "custom" ? layer.styleConfig.colorRamp : "vivid";
  return COLOR_RAMPS[rampId as keyof typeof COLOR_RAMPS] ?? COLOR_RAMPS.vivid;
};

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

export const getLayerLabelFieldOptions = (layer: GeoPlusLayerItem) => {
  const fieldsByCanonical = new Map<string, string>();
  const addField = (fieldName: string) => {
    const trimmed = fieldName.trim();
    if (!trimmed) {
      return;
    }
    const canonical = trimmed.toLocaleLowerCase();
    if (!fieldsByCanonical.has(canonical)) {
      fieldsByCanonical.set(canonical, trimmed);
    }
  };

  const candidates = [layer.rawInlineData, layer.inlineData];
  for (const candidate of candidates) {
    if (!isGeoJsonFeatureCollection(candidate)) {
      continue;
    }
    for (const feature of candidate.features.slice(0, 120)) {
      const properties = feature?.properties;
      if (!properties || typeof properties !== "object") {
        continue;
      }
      for (const key of Object.keys(properties)) {
        addField(key);
      }
    }
  }

  for (const column of layer.duckDbColumns ?? []) {
    addField(column);
  }

  return [...fieldsByCanonical.values()].sort((left, right) => {
    const baseCompare = left.localeCompare(right, undefined, { sensitivity: "base" });
    if (baseCompare !== 0) {
      return baseCompare;
    }
    return left.localeCompare(right);
  });
};
