"use client";

import type * as duckdb from "@duckdb/duckdb-wasm";
import { getLocalDuckDbBundles, hasUsableDuckDbBundle, type DuckDbBundle, type ResolvedDuckDbBundle } from "@/lib/geoplus/duckdb-bundles";

type RawVisualizationPoint = {
  longitude: number;
  latitude: number;
  category: string;
  value: number;
};

export type ProcessedVisualizationPoint = {
  longitude: number;
  latitude: number;
  category: string;
  magnitude: number;
};

const SAMPLE_POINTS: RawVisualizationPoint[] = [
  { longitude: 90.4125, latitude: 23.8103, category: "mobility", value: 8 },
  { longitude: 90.3988, latitude: 23.7276, category: "mobility", value: 6 },
  { longitude: 90.3563, latitude: 23.8223, category: "mobility", value: 7 },
  { longitude: 88.3639, latitude: 22.5726, category: "risk", value: 9 },
  { longitude: 88.4311, latitude: 22.5916, category: "risk", value: 7 },
  { longitude: 88.3312, latitude: 22.5033, category: "risk", value: 6 },
  { longitude: 77.5946, latitude: 12.9716, category: "demand", value: 10 },
  { longitude: 77.6387, latitude: 12.9352, category: "demand", value: 8 },
  { longitude: 77.5652, latitude: 13.0023, category: "demand", value: 7 },
  { longitude: 72.8777, latitude: 19.076, category: "supply", value: 9 },
  { longitude: 72.915, latitude: 19.107, category: "supply", value: 6 },
  { longitude: 72.8411, latitude: 19.0435, category: "supply", value: 8 },
];

let cachedProcessedPointsPromise: Promise<ProcessedVisualizationPoint[]> | null = null;
const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const buildFallbackAggregation = (points: RawVisualizationPoint[]) => {
  const grouped = new Map<string, { lonSum: number; latSum: number; magnitude: number; count: number }>();

  for (const point of points) {
    const previous = grouped.get(point.category) ?? { lonSum: 0, latSum: 0, magnitude: 0, count: 0 };
    previous.lonSum += point.longitude;
    previous.latSum += point.latitude;
    previous.magnitude += point.value;
    previous.count += 1;
    grouped.set(point.category, previous);
  }

  return [...grouped.entries()].map(([category, aggregate]) => ({
    category,
    longitude: aggregate.lonSum / aggregate.count,
    latitude: aggregate.latSum / aggregate.count,
    magnitude: aggregate.magnitude,
  }));
};

const buildDuckDbAggregationWithBundle = async (points: RawVisualizationPoint[], bundle: ResolvedDuckDbBundle) => {
  const duckdbRuntime = await import("@duckdb/duckdb-wasm");
  const worker = new Worker(bundle.mainWorker);
  worker.addEventListener("error", (event) => {
    event.preventDefault();
  });
  const logger = new duckdbRuntime.ConsoleLogger();
  const db = new duckdbRuntime.AsyncDuckDB(logger, worker);
  let connection: duckdb.AsyncDuckDBConnection | null = null;

  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    connection = await db.connect();
    await connection.query("CREATE TABLE points (longitude DOUBLE, latitude DOUBLE, category VARCHAR, value DOUBLE)");

    const valuesSql = points
      .map(
        (point) =>
          `(${point.longitude.toFixed(6)}, ${point.latitude.toFixed(6)}, '${point.category.replace(/'/g, "''")}', ${point.value.toFixed(3)})`,
      )
      .join(", ");

    await connection.query(`INSERT INTO points VALUES ${valuesSql}`);
    const result = await connection.query(`
      SELECT
        AVG(longitude) AS longitude,
        AVG(latitude) AS latitude,
        category,
        SUM(value) AS magnitude
      FROM points
      GROUP BY category
      ORDER BY magnitude DESC
    `);

    return result.toArray().map((entry) => {
      const row = entry.toJSON() as Record<string, unknown>;
      return {
        longitude: toNumber(row.longitude),
        latitude: toNumber(row.latitude),
        category: String(row.category ?? "unknown"),
        magnitude: toNumber(row.magnitude),
      };
    });
  } finally {
    if (connection) {
      await connection.close();
    }
    await db.terminate();
    worker.terminate();
  }
};

const buildDuckDbAggregation = async (points: RawVisualizationPoint[]) => {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("DuckDB worker is unavailable in this environment.");
  }

  const bundles = getLocalDuckDbBundles();
  const mvpBundle = bundles.mvp as DuckDbBundle;
  const candidates = [mvpBundle].filter(hasUsableDuckDbBundle);

  if (candidates.length === 0) {
    throw new Error("DuckDB bundle could not be resolved.");
  }

  const seenKeys = new Set<string>();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    const candidateKey = `${candidate.mainModule}|${candidate.mainWorker}|${candidate.pthreadWorker ?? ""}`;
    if (seenKeys.has(candidateKey)) {
      continue;
    }
    seenKeys.add(candidateKey);

    try {
      return await buildDuckDbAggregationWithBundle(points, candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("DuckDB aggregation failed.");
};

export const getProcessedVisualizationData = async () => {
  if (!cachedProcessedPointsPromise) {
    cachedProcessedPointsPromise = (async () => {
      try {
        return await buildDuckDbAggregation(SAMPLE_POINTS);
      } catch {
        return buildFallbackAggregation(SAMPLE_POINTS);
      }
    })();
  }

  return cachedProcessedPointsPromise;
};
