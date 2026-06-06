import initSqlJs from "sql.js";
import type { UploadFileParser, ParsedUploadLayer } from "@/lib/geoplus/upload-parsers/types";
import { persistUploadFile, resolveLayerFileUrl } from "@/lib/geoplus/opfs-storage";
import { detectGeoJsonSourceProjection, reprojectGeoJsonToWgs84 } from "@/lib/geoplus/projection";

// ─── Types ────────────────────────────────────────────────────────────────────

type SqljsAdapterClass = {
  /** Pre-set the initialized sql.js module so the adapter skips WASM loading. */
  SQL: unknown;
};

type GeoPackageRuntime = {
  GeoPackageAPI: {
    open: (gppathOrByteArray: Uint8Array) => Promise<GeoPackageConnection>;
  };
  GeoPackage: {
    parseFeatureRowIntoGeoJSON: (featureRow: unknown, srs: unknown, columnMap?: unknown) => GeoJSON.Feature;
  };
  /**
   * Exported SqljsAdapter class — we use it to inject a pre-initialized
   * sql.js module and bypass the adapter's own WASM loading (which would
   * otherwise try to load a WASM binary that may not match the bundled sql.js).
   */
  SqljsAdapter: SqljsAdapterClass;
  setSqljsWasmLocateFile: (locateFile: (filename: string) => string) => void;
};

type FeatureDao = {
  srs: unknown;
  /**
   * Returns an array of raw row objects ({colName: value} records).
   * Each must be passed to getRow() before parsing.
   */
  queryForAll: () => unknown[];
  getRow: (rawRow: unknown) => unknown;
};

type GeoPackageConnection = {
  close: () => void;
  getFeatureTables: () => string[];
  getFeatureDao: (table: string) => FeatureDao;
};

type GeoPackageProjectionTransform = {
  transformCoordinateArray: (coordinates: number[]) => number[];
};

type GeoPackageProjection = {
  getTransformationTo: (authority?: string, code?: string | number) => GeoPackageProjectionTransform;
};

type GeoPackageSrs = {
  getProjection?: () => GeoPackageProjection | null;
};

declare global {
  interface Window {
    GeoPackage?: GeoPackageRuntime;
  }
}

// ─── Runtime loading ──────────────────────────────────────────────────────────

let runtimePromise: Promise<GeoPackageRuntime> | null = null;
let runtimeConfigured = false;
let sqlWasmBinaryPromise: Promise<ArrayBuffer> | null = null;

export const resolvePublicAssetUrl = (baseUrl: string, filename: string) =>
  new URL(filename, baseUrl).toString();

const resolveAppPublicAssetUrl = (filename: string) =>
  typeof window !== "undefined"
    ? new URL(filename, window.location.origin).toString()
    : `/${filename}`;

export const configureGeoPackageRuntime = (runtime: GeoPackageRuntime) => {
  if (runtimeConfigured) {
    return;
  }

  const locateSqlWasm = (filename: string) => resolveAppPublicAssetUrl(filename);
  runtime.setSqljsWasmLocateFile(locateSqlWasm);
  runtimeConfigured = true;
};

const loadSqlWasmBinary = async (): Promise<ArrayBuffer> => {
  if (sqlWasmBinaryPromise) {
    return sqlWasmBinaryPromise;
  }

  const sqlWasmUrl = resolveAppPublicAssetUrl("sql-wasm.wasm");
  sqlWasmBinaryPromise = fetch(sqlWasmUrl, { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load sql.js wasm from ${sqlWasmUrl} (${response.status} ${response.statusText}).`,
        );
      }
      return response.arrayBuffer();
    })
    .catch((error: unknown) => {
      sqlWasmBinaryPromise = null;
      throw error;
    });

  return sqlWasmBinaryPromise;
};

const loadGeoPackageRuntime = async (): Promise<GeoPackageRuntime> => {
  if (typeof window === "undefined") {
    throw new Error("GeoPackage uploads are only supported in the browser.");
  }

  if (window.GeoPackage) {
    configureGeoPackageRuntime(window.GeoPackage);
    return window.GeoPackage;
  }

  if (!runtimePromise) {
    runtimePromise = new Promise<GeoPackageRuntime>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/geopackage.min.js";
      script.async = true;

      script.onload = () => {
        if (window.GeoPackage) {
          configureGeoPackageRuntime(window.GeoPackage);
          resolve(window.GeoPackage);
        } else {
          reject(new Error("GeoPackage runtime loaded but API is unavailable."));
        }
      };

      script.onerror = () => {
        runtimePromise = null; // allow retry on next upload attempt
        reject(new Error("Failed to load GeoPackage runtime (/geopackage.min.js)."));
      };

      document.head.appendChild(script);
    });
  }

  return runtimePromise;
};

// ─── sql.js injection ─────────────────────────────────────────────────────────

let sqlInjected = false;

/**
 * Pre-initialize sql.js using the npm package (same WASM file that MBTiles
 * already uses — /sql-wasm.wasm) and inject the resulting SQL module directly
 * into `SqljsAdapter.SQL`.
 *
 * Why: geopackage.min.js bundles its own copy of sql.js (module 3686) and
 * fetches the WASM via `locateFile`.  That bundled copy may be a different
 * version than /sql-wasm.wasm, causing an instantiation mismatch and the
 * cryptic "Unable to open GeoPackage." error.
 *
 * SqljsAdapter.initialize() checks `if (null == SQL) { loadWASM() } else { use(SQL) }`.
 * By setting `SqljsAdapter.SQL` before `open()` is called, we bypass the
 * adapter's WASM loader entirely and use the already-working sql.js instance.
 */
const ensureSqlInjected = async (runtime: GeoPackageRuntime): Promise<void> => {
  if (sqlInjected) return;

  const SQL = await initSqlJs({
    locateFile: (file) => resolveAppPublicAssetUrl(file),
    wasmBinary: await loadSqlWasmBinary(),
  });
  // Inject into the static class property the adapter checks on every initialize()
  runtime.SqljsAdapter.SQL = SQL;
  sqlInjected = true;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inferLayerType = (features: GeoJSON.Feature[]) => {
  const hasOnlyPoints = features.every(
    (f) => f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint",
  );
  return hasOnlyPoints ? "scatterplot" : "geojson";
};

const toFeatureCollection = (features: GeoJSON.Feature[]) => ({
  type: "FeatureCollection" as const,
  features,
});

const isCoordinatePair = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

const transformCoordinatesToWgs84 = (
  coordinates: unknown,
  transform: GeoPackageProjectionTransform,
): unknown => {
  if (!Array.isArray(coordinates)) {
    return coordinates;
  }

  if (isCoordinatePair(coordinates)) {
    const [longitude, latitude] = transform.transformCoordinateArray([
      Number(coordinates[0]),
      Number(coordinates[1]),
    ]);
    if (coordinates.length === 2) {
      return [longitude, latitude];
    }
    return [longitude, latitude, ...coordinates.slice(2)];
  }

  return coordinates.map((entry) => transformCoordinatesToWgs84(entry, transform));
};

const transformGeometryToWgs84 = (
  geometryValue: unknown,
  transform: GeoPackageProjectionTransform,
): GeoJSON.Geometry | null => {
  if (!geometryValue || typeof geometryValue !== "object") {
    return null;
  }

  const geometry = geometryValue as Record<string, unknown>;
  if (typeof geometry.type !== "string") {
    return null;
  }

  if (geometry.type === "GeometryCollection") {
    const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
    return {
      ...(geometry as unknown as GeoJSON.GeometryCollection),
      geometries: geometries
        .map((childGeometry) => transformGeometryToWgs84(childGeometry, transform))
        .filter((childGeometry): childGeometry is GeoJSON.Geometry => Boolean(childGeometry)),
    };
  }

  return {
    ...(geometry as unknown as GeoJSON.Geometry),
    coordinates: transformCoordinatesToWgs84(geometry.coordinates, transform),
  } as GeoJSON.Geometry;
};

const reprojectFeatureToWgs84 = (feature: GeoJSON.Feature, srs: unknown): GeoJSON.Feature => {
  const projection = (srs as GeoPackageSrs | null | undefined)?.getProjection?.();
  if (projection?.getTransformationTo) {
    try {
      const transform = projection.getTransformationTo("EPSG", 4326);
      const geometry = transformGeometryToWgs84(feature.geometry, transform);
      if (geometry) {
        return {
          ...feature,
          geometry,
        };
      }
    } catch (error) {
      console.warn("GeoPackage: failed to transform feature geometry to WGS84 via SRS metadata.", error);
    }
  }

  const fallbackProjection = detectGeoJsonSourceProjection(feature);
  if (fallbackProjection && fallbackProjection !== "EPSG:4326" && fallbackProjection !== "OGC:CRS84") {
    return reprojectGeoJsonToWgs84(feature, fallbackProjection) as GeoJSON.Feature;
  }

  return feature;
};

// ─── Parser ───────────────────────────────────────────────────────────────────

export const parseGeoPackageUpload: UploadFileParser = async (file) => {
  const uploadStorageUrl = await persistUploadFile("geopackage", file);
  const uploadFile = (await resolveLayerFileUrl(uploadStorageUrl)) ?? file;
  const runtime = await loadGeoPackageRuntime();

  // Inject the pre-initialized SQL module before opening the database.
  await ensureSqlInjected(runtime);

  const fileBuffer = new Uint8Array(await uploadFile.arrayBuffer());
  const geoPackage = await runtime.GeoPackageAPI.open(fileBuffer);

  try {
    const featureTables = geoPackage.getFeatureTables();
    if (featureTables.length === 0) {
      throw new Error("GeoPackage does not contain any feature tables.");
    }

    const parsedLayers: ParsedUploadLayer[] = [];

    for (const table of featureTables) {
      const featureDao = geoPackage.getFeatureDao(table);
      const srs = featureDao.srs;

      // queryForEach() without a callback tries to call an undefined row
      // handler and throws. queryForAll() → connection.all(sql) → returns a
      // plain-object array; getRow() wraps each entry into a typed FeatureRow.
      let rawRows: unknown[];
      try {
        rawRows = featureDao.queryForAll();
      } catch (err) {
        console.warn(`GeoPackage: could not query table "${table}":`, err);
        continue;
      }

      const features: GeoJSON.Feature[] = [];

      for (const rawRow of rawRows) {
        if (!rawRow) continue;

        let featureRow: unknown;
        try {
          featureRow = featureDao.getRow(rawRow);
        } catch {
          continue;
        }

        let parsedFeature: GeoJSON.Feature;
        try {
          parsedFeature = runtime.GeoPackage.parseFeatureRowIntoGeoJSON(
            featureRow,
            srs,
          ) as GeoJSON.Feature;
        } catch {
          continue;
        }

        parsedFeature = reprojectFeatureToWgs84(parsedFeature, srs);

        // Skip attribute-only rows with no geometry
        if (!parsedFeature.geometry) continue;

        const properties = (parsedFeature.properties ?? {}) as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(properties, "source_table")) {
          properties.source_table = table;
        }

        features.push({ ...parsedFeature, properties });
      }

      if (features.length > 0) {
        parsedLayers.push({
          layerName: table,
          formatLabel: "GeoPackage",
          layerType: inferLayerType(features),
          inlineData: toFeatureCollection(features),
          uploadStorageUrl,
          featureCountEstimate: features.length,
          readyMessage: `GeoPackage layer "${table}" parsed and ready to add.`,
        });
      }
    }

    if (parsedLayers.length === 0) {
      throw new Error("No features found in GeoPackage feature tables.");
    }

    return parsedLayers;
  } finally {
    geoPackage.close();
  }
};
