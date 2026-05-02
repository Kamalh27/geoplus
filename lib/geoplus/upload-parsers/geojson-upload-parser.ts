import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

const isGeoJsonType = (value: unknown) =>
  typeof value === "string" &&
  [
    "FeatureCollection",
    "Feature",
    "GeometryCollection",
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
  ].includes(value);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const detectTileJsonSource = (value: Record<string, unknown>) => {
  const tiles = value.tiles;
  if (!Array.isArray(tiles)) {
    return null;
  }

  const firstTile = tiles.find((entry) => typeof entry === "string");
  if (!firstTile || typeof firstTile !== "string") {
    return null;
  }

  const normalized = firstTile.toLowerCase();
  const layerType = normalized.endsWith(".pbf") || normalized.endsWith(".mvt") ? "mvt" : "raster-tile";
  return {
    sourceUrl: firstTile,
    layerType,
  } as const;
};

export const parseGeoJsonUpload: UploadFileParser = async (file) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("Unable to parse JSON. Upload a valid GeoJSON or TileJSON file.");
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new Error("Invalid JSON object.");
  }

  const tileJsonSource = detectTileJsonSource(record);
  if (tileJsonSource) {
    return {
      formatLabel: "TileJSON",
      layerType: tileJsonSource.layerType,
      sourceUrl: tileJsonSource.sourceUrl,
      readyMessage: "TileJSON parsed and ready to add.",
    };
  }

  if (!isGeoJsonType(record.type)) {
    throw new Error("JSON is not valid GeoJSON or TileJSON.");
  }

  return {
    formatLabel: "GeoJSON",
    layerType: "geojson",
    inlineData: parsed,
    readyMessage: "GeoJSON parsed and ready to add.",
  };
};
