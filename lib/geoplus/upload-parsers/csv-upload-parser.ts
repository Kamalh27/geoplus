import { csvParse, tsvParse } from "d3-dsv";
import { convertWKTToGeometry } from "@loaders.gl/gis";

import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

type CsvRecord = Record<string, string>;

const LONGITUDE_CANDIDATES = ["longitude", "lon", "lng", "x"];
const LATITUDE_CANDIDATES = ["latitude", "lat", "y"];
const WKT_CANDIDATES = ["wkt", "geometry_wkt", "geom_wkt"];

const normalizeHeader = (value: string) => value.trim().toLowerCase();

const findColumn = (headers: string[], candidates: string[]) => {
  const normalized = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));
  const match = normalized.find((header) => candidates.includes(header.normalized));
  return match?.original ?? null;
};

const toFeatureCollection = (features: GeoJSON.Feature[]) => ({
  type: "FeatureCollection",
  features,
});

const parseRows = (fileName: string, text: string) => {
  if (fileName.toLowerCase().endsWith(".tsv")) {
    return tsvParse(text) as unknown as CsvRecord[];
  }
  return csvParse(text) as unknown as CsvRecord[];
};

const inferLayerType = (features: GeoJSON.Feature[]) => {
  const hasOnlyPoints = features.every((feature) => feature.geometry?.type === "Point");
  return hasOnlyPoints ? "scatterplot" : "geojson";
};

export const parseCsvUpload: UploadFileParser = async (file) => {
  const text = await file.text();
  const rows = parseRows(file.name, text);

  if (rows.length === 0) {
    throw new Error("CSV/TSV file has no rows.");
  }

  const headers = Object.keys(rows[0] ?? {});
  const longitudeColumn = findColumn(headers, LONGITUDE_CANDIDATES);
  const latitudeColumn = findColumn(headers, LATITUDE_CANDIDATES);
  const wktColumn = findColumn(headers, WKT_CANDIDATES);

  const features: GeoJSON.Feature[] = [];

  for (const row of rows) {
    const properties: Record<string, unknown> = { ...row };
    let geometry: GeoJSON.Geometry | null = null;

    if (longitudeColumn && latitudeColumn) {
      const longitude = Number(row[longitudeColumn]);
      const latitude = Number(row[latitudeColumn]);
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        geometry = {
          type: "Point",
          coordinates: [longitude, latitude],
        };
        delete properties[longitudeColumn];
        delete properties[latitudeColumn];
      }
    }

    if (!geometry && wktColumn) {
      const wkt = row[wktColumn];
      if (typeof wkt === "string" && wkt.trim()) {
        try {
          geometry = convertWKTToGeometry(wkt) as GeoJSON.Geometry;
          delete properties[wktColumn];
        } catch {
          geometry = null;
        }
      }
    }

    if (!geometry) {
      continue;
    }

    features.push({
      type: "Feature",
      properties,
      geometry,
    });
  }

  if (features.length === 0) {
    throw new Error("CSV/TSV must include valid lon/lat columns or a WKT geometry column.");
  }

  const layerType = inferLayerType(features);
  const formatLabel = file.name.toLowerCase().endsWith(".tsv") ? "TSV" : "CSV";

  return [
    {
      formatLabel,
      layerType,
      inlineData: toFeatureCollection(features),
      readyMessage: `${formatLabel} parsed and ready to add.`,
    }
  ];
};
