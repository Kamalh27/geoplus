import * as duckdb from "@duckdb/duckdb-wasm";
import { convertWKBToGeometry, convertWKTToGeometry } from "@loaders.gl/gis";

import { getLocalDuckDbBundles, type DuckDbBundle } from "@/lib/geoplus/duckdb-bundles";
import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

type ColumnInfo = {
  name: string;
  normalizedName: string;
  type: string;
};

const LONGITUDE_CANDIDATES = ["longitude", "lon", "lng", "x"];
const LATITUDE_CANDIDATES = ["latitude", "lat", "y"];

const normalizeName = (value: string) => value.trim().toLowerCase();

const toArrayBuffer = (value: unknown): ArrayBuffer | null => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const typed = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return typed.slice().buffer;
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return new Uint8Array(value).buffer;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const hex = trimmed.startsWith("\\x") ? trimmed.slice(2) : trimmed;
    if (hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      const bytes = new Uint8Array(hex.length / 2);
      for (let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
      }
      return bytes.buffer;
    }
  }

  return null;
};

const parseGeometryValue = (value: unknown): GeoJSON.Geometry | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      if (!/^[0-9a-fA-F]+$/.test(trimmed) && !trimmed.startsWith("\\x")) {
        return convertWKTToGeometry(trimmed) as GeoJSON.Geometry;
      }
    } catch {
      // Try WKB path below.
    }
  }

  const arrayBuffer = toArrayBuffer(value);
  if (!arrayBuffer) {
    return null;
  }

  try {
    return convertWKBToGeometry(arrayBuffer) as GeoJSON.Geometry;
  } catch {
    return null;
  }
};

const sanitizePropertyValue = (value: unknown): unknown => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (ArrayBuffer.isView(value)) {
    return `binary(${value.byteLength} bytes)`;
  }

  if (value instanceof ArrayBuffer) {
    return `binary(${value.byteLength} bytes)`;
  }

  return String(value);
};

const getColumnInfo = (row: Record<string, unknown>): ColumnInfo | null => {
  const name = row.column_name ?? row.columnName ?? row.column;
  if (typeof name !== "string" || !name.trim()) {
    return null;
  }

  const type = String(row.column_type ?? row.columnType ?? row.type ?? "").toUpperCase();
  return {
    name,
    normalizedName: normalizeName(name),
    type,
  };
};

const detectGeometryColumn = (columns: ColumnInfo[]) => {
  const preferredNames = [
    "geometry",
    "geom",
    "wkb_geometry",
    "wkb_geom",
    "geom_wkb",
    "the_geom",
    "wkt",
    "geometry_wkt",
  ];

  const preferred = columns.find((column) => preferredNames.includes(column.normalizedName));
  if (preferred) {
    return preferred;
  }

  const blobColumn = columns.find((column) => column.type.includes("BLOB") || column.type.includes("BYTEA") || column.type.includes("VARBINARY"));
  if (blobColumn) {
    return blobColumn;
  }

  return columns.find(
    (column) =>
      (column.type.includes("VARCHAR") || column.type.includes("TEXT")) &&
      (column.normalizedName.includes("geom") || column.normalizedName.includes("wkt")),
  );
};

const detectCoordinateColumns = (columns: ColumnInfo[]) => {
  const longitudeColumn = columns.find((column) => LONGITUDE_CANDIDATES.includes(column.normalizedName));
  const latitudeColumn = columns.find((column) => LATITUDE_CANDIDATES.includes(column.normalizedName));
  return {
    longitudeColumn,
    latitudeColumn,
  };
};

const inferLayerType = (features: GeoJSON.Feature[]) => {
  const hasOnlyPoints = features.every((feature) => feature.geometry?.type === "Point");
  return hasOnlyPoints ? "scatterplot" : "geojson";
};

export const parseGeoparquetUpload: UploadFileParser = async (file) => {
  const bundles = getLocalDuckDbBundles();
  const bundle = bundles.mvp as DuckDbBundle;

  if (!bundle.mainModule || !bundle.mainWorker) {
    throw new Error("Unable to initialize GeoParquet parser runtime.");
  }

  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  let connection: duckdb.AsyncDuckDBConnection | null = null;
  let registeredFileName: string | null = null;

  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? undefined);
    connection = await db.connect();

    registeredFileName = `upload-${Date.now()}-${Math.round(Math.random() * 10000)}.parquet`;
    const escapedFileName = registeredFileName.replace(/'/g, "''");
    await db.registerFileBuffer(registeredFileName, new Uint8Array(await file.arrayBuffer()));

    const schemaTable = await connection.query(`DESCRIBE SELECT * FROM read_parquet('${escapedFileName}')`);
    const columns = schemaTable
      .toArray()
      .map((entry) => entry.toJSON() as Record<string, unknown>)
      .map((row) => getColumnInfo(row))
      .filter((column): column is ColumnInfo => Boolean(column));

    if (columns.length === 0) {
      throw new Error("GeoParquet has no readable columns.");
    }

    const geometryColumn = detectGeometryColumn(columns);
    const { longitudeColumn, latitudeColumn } = detectCoordinateColumns(columns);

    const dataTable = await connection.query(`SELECT * FROM read_parquet('${escapedFileName}')`);
    const rows = dataTable.toArray().map((entry) => entry.toJSON() as Record<string, unknown>);

    const features: GeoJSON.Feature[] = [];

    for (const row of rows) {
      let geometry: GeoJSON.Geometry | null = null;

      if (geometryColumn) {
        geometry = parseGeometryValue(row[geometryColumn.name]);
      }

      if (!geometry && longitudeColumn && latitudeColumn) {
        const longitude = Number(row[longitudeColumn.name]);
        const latitude = Number(row[latitudeColumn.name]);
        if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
          geometry = {
            type: "Point",
            coordinates: [longitude, latitude],
          };
        }
      }

      if (!geometry) {
        continue;
      }

      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (geometryColumn && key === geometryColumn.name) {
          continue;
        }
        if ((longitudeColumn && key === longitudeColumn.name) || (latitudeColumn && key === latitudeColumn.name)) {
          continue;
        }
        properties[key] = sanitizePropertyValue(value);
      }

      features.push({
        type: "Feature",
        geometry,
        properties,
      });
    }

    if (features.length === 0) {
      throw new Error("No geometries found in GeoParquet file.");
    }

    return {
      formatLabel: "GeoParquet",
      layerType: inferLayerType(features),
      inlineData: {
        type: "FeatureCollection",
        features,
      },
      readyMessage: "GeoParquet parsed and ready to add.",
    };
  } finally {
    try {
      if (connection) {
        await connection.close();
      }
    } catch {
      // Ignore cleanup errors.
    }

    try {
      if (registeredFileName) {
        await db.dropFile(registeredFileName);
      }
    } catch {
      // Ignore cleanup errors.
    }

    await db.terminate();
    worker.terminate();
  }
};
