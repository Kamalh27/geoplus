import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

type GeoPackageRuntime = {
  GeoPackageAPI: {
    open: (gppathOrByteArray: Uint8Array) => Promise<GeoPackageConnection>;
  };
  GeoPackage: {
    parseFeatureRowIntoGeoJSON: (featureRow: unknown, srs: unknown, columnMap?: unknown) => GeoJSON.Feature;
  };
  setSqljsWasmLocateFile: (locateFile: (filename: string) => string) => void;
};

type GeoPackageConnection = {
  close: () => void;
  getFeatureTables: () => string[];
  getFeatureDao: (table: string) => {
    srs: unknown;
    queryForEach: () => Iterable<unknown>;
    getRow: (row: unknown) => unknown;
  };
};

declare global {
  interface Window {
    GeoPackage?: GeoPackageRuntime;
  }
}

let runtimePromise: Promise<GeoPackageRuntime> | null = null;
let isGeoPackageWasmConfigured = false;

const loadGeoPackageRuntime = async (): Promise<GeoPackageRuntime> => {
  if (typeof window === "undefined") {
    throw new Error("GeoPackage uploads are only supported in the browser.");
  }

  if (window.GeoPackage) {
    return window.GeoPackage;
  }

  if (!runtimePromise) {
    runtimePromise = new Promise<GeoPackageRuntime>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/geopackage.min.js";
      script.async = true;

      script.onload = () => {
        if (window.GeoPackage) {
          resolve(window.GeoPackage);
        } else {
          reject(new Error("GeoPackage runtime loaded but API is unavailable."));
        }
      };

      script.onerror = () => {
        reject(new Error("Failed to load GeoPackage runtime."));
      };

      document.head.appendChild(script);
    });
  }

  return runtimePromise;
};

const configureGeoPackageWasm = (runtime: GeoPackageRuntime) => {
  if (isGeoPackageWasmConfigured) {
    return;
  }

  runtime.setSqljsWasmLocateFile((filename) => {
    if (filename === "sql-wasm.wasm") {
      return "/sql-wasm.wasm";
    }
    return filename;
  });

  isGeoPackageWasmConfigured = true;
};

const inferLayerType = (features: GeoJSON.Feature[]) => {
  const hasOnlyPoints = features.every((feature) => feature.geometry?.type === "Point");
  return hasOnlyPoints ? "scatterplot" : "geojson";
};

const toFeatureCollection = (features: GeoJSON.Feature[]) => ({
  type: "FeatureCollection",
  features,
});

export const parseGeoPackageUpload: UploadFileParser = async (file) => {
  const runtime = await loadGeoPackageRuntime();
  configureGeoPackageWasm(runtime);

  const fileBuffer = new Uint8Array(await file.arrayBuffer());
  const geoPackage = await runtime.GeoPackageAPI.open(fileBuffer);

  try {
    const featureTables = geoPackage.getFeatureTables();
    if (featureTables.length === 0) {
      throw new Error("GeoPackage does not contain any feature tables.");
    }

    const mergedFeatures: GeoJSON.Feature[] = [];

    for (const table of featureTables) {
      const featureDao = geoPackage.getFeatureDao(table);
      const srs = featureDao.srs;
      const iterator = featureDao.queryForEach();

      for (const row of iterator) {
        if (!row) {
          continue;
        }

        const featureRow = featureDao.getRow(row);
        const parsedFeature = runtime.GeoPackage.parseFeatureRowIntoGeoJSON(featureRow, srs) as GeoJSON.Feature;

        const properties = (parsedFeature.properties ?? {}) as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(properties, "source_table")) {
          properties.source_table = table;
        }

        mergedFeatures.push({
          ...parsedFeature,
          properties,
        });
      }
    }

    if (mergedFeatures.length === 0) {
      throw new Error("No features found in GeoPackage feature tables.");
    }

    return {
      formatLabel: "GeoPackage",
      layerType: inferLayerType(mergedFeatures),
      inlineData: toFeatureCollection(mergedFeatures),
      readyMessage: "GeoPackage parsed and ready to add.",
    };
  } finally {
    geoPackage.close();
  }
};
