export type GeoPlusSourceProjection = "EPSG:4326" | "OGC:CRS84" | "EPSG:3857";
export type GeoPlusSourceProjectionChoice = "default" | GeoPlusSourceProjection;

const WEB_MERCATOR_MAX = 20037508.342789244;
const WEB_MERCATOR_MAX_WITH_MARGIN = WEB_MERCATOR_MAX * 1.02;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const normalizeProjectionName = (value: unknown): GeoPlusSourceProjection | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === "EPSG:4326" ||
    normalized === "WGS84" ||
    normalized === "WGS 84" ||
    normalized === "URN:OGC:DEF:CRS:EPSG::4326"
  ) {
    return "EPSG:4326";
  }

  if (normalized === "OGC:CRS84" || normalized === "CRS84" || normalized === "URN:OGC:DEF:CRS:OGC:1.3:CRS84") {
    return "OGC:CRS84";
  }

  if (
    normalized === "EPSG:3857" ||
    normalized === "EPSG:900913" ||
    normalized === "EPSG:102100" ||
    normalized === "URN:OGC:DEF:CRS:EPSG::3857"
  ) {
    return "EPSG:3857";
  }

  return null;
};

const detectProjectionFromCrsMetadata = (value: unknown): GeoPlusSourceProjection | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const crs = asRecord(record.crs);
  const properties = asRecord(crs?.properties);
  const nameFromProperties = normalizeProjectionName(properties?.name);
  if (nameFromProperties) {
    return nameFromProperties;
  }

  const nameFromCrs = normalizeProjectionName(crs?.name);
  if (nameFromCrs) {
    return nameFromCrs;
  }

  return null;
};

const isCoordinatePair = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";

const collectCoordinateSamples = (value: unknown, samples: [number, number][], limit = 220) => {
  if (samples.length >= limit || !Array.isArray(value)) {
    return;
  }

  if (isCoordinatePair(value)) {
    samples.push([Number(value[0]), Number(value[1])]);
    return;
  }

  for (const child of value) {
    if (samples.length >= limit) {
      return;
    }
    collectCoordinateSamples(child, samples, limit);
  }
};

const collectGeoJsonCoordinateSamples = (geojsonValue: unknown) => {
  const samples: [number, number][] = [];
  const geojson = asRecord(geojsonValue);
  if (!geojson || typeof geojson.type !== "string") {
    return samples;
  }

  if (geojson.type === "FeatureCollection") {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    for (const feature of features) {
      const featureRecord = asRecord(feature);
      const geometry = asRecord(featureRecord?.geometry);
      if (!geometry || typeof geometry.type !== "string") {
        continue;
      }
      if (geometry.type === "GeometryCollection") {
        const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
        for (const childGeometry of geometries) {
          const childRecord = asRecord(childGeometry);
          collectCoordinateSamples(childRecord?.coordinates, samples);
        }
      } else {
        collectCoordinateSamples(geometry.coordinates, samples);
      }
      if (samples.length >= 220) {
        return samples;
      }
    }
    return samples;
  }

  if (geojson.type === "Feature") {
    const geometry = asRecord(geojson.geometry);
    if (!geometry || typeof geometry.type !== "string") {
      return samples;
    }
    if (geometry.type === "GeometryCollection") {
      const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
      for (const childGeometry of geometries) {
        const childRecord = asRecord(childGeometry);
        collectCoordinateSamples(childRecord?.coordinates, samples);
      }
    } else {
      collectCoordinateSamples(geometry.coordinates, samples);
    }
    return samples;
  }

  if (geojson.type === "GeometryCollection") {
    const geometries = Array.isArray(geojson.geometries) ? geojson.geometries : [];
    for (const childGeometry of geometries) {
      const childRecord = asRecord(childGeometry);
      collectCoordinateSamples(childRecord?.coordinates, samples);
    }
    return samples;
  }

  collectCoordinateSamples(geojson.coordinates, samples);
  return samples;
};

const detectProjectionFromCoordinates = (geojsonValue: unknown): GeoPlusSourceProjection | null => {
  const samples = collectGeoJsonCoordinateSamples(geojsonValue);
  if (samples.length === 0) {
    return null;
  }

  const hasOutOfWgs84Range = samples.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90);
  if (!hasOutOfWgs84Range) {
    return "EPSG:4326";
  }

  const allWithinWebMercator = samples.every(
    ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= WEB_MERCATOR_MAX_WITH_MARGIN && Math.abs(y) <= WEB_MERCATOR_MAX_WITH_MARGIN,
  );
  if (allWithinWebMercator) {
    return "EPSG:3857";
  }

  return null;
};

export const detectGeoJsonSourceProjection = (geojsonValue: unknown): GeoPlusSourceProjection | null => {
  const fromCrs = detectProjectionFromCrsMetadata(geojsonValue);
  if (fromCrs) {
    return fromCrs;
  }
  return detectProjectionFromCoordinates(geojsonValue);
};

const toWgs84FromWebMercator = (x: number, y: number): [number, number] => {
  const longitude = (x / WEB_MERCATOR_MAX) * 180;
  const latitudeRadians = Math.atan(Math.sinh((y / WEB_MERCATOR_MAX) * Math.PI));
  const latitude = (latitudeRadians * 180) / Math.PI;
  return [longitude, latitude];
};

const reprojectCoordinatesToWgs84 = (coordinates: unknown, sourceProjection: GeoPlusSourceProjection): unknown => {
  if (!Array.isArray(coordinates)) {
    return coordinates;
  }

  if (isCoordinatePair(coordinates)) {
    if (sourceProjection !== "EPSG:3857") {
      return [...coordinates];
    }

    const [longitude, latitude] = toWgs84FromWebMercator(Number(coordinates[0]), Number(coordinates[1]));
    if (coordinates.length === 2) {
      return [longitude, latitude];
    }
    return [longitude, latitude, ...coordinates.slice(2)];
  }

  return coordinates.map((entry) => reprojectCoordinatesToWgs84(entry, sourceProjection));
};

const reprojectGeometryToWgs84 = (geometryValue: unknown, sourceProjection: GeoPlusSourceProjection): GeoJSON.Geometry | null => {
  const geometry = asRecord(geometryValue);
  if (!geometry || typeof geometry.type !== "string") {
    return null;
  }

  if (geometry.type === "GeometryCollection") {
    const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
    return {
      ...geometry,
      geometries: geometries
        .map((childGeometry) => reprojectGeometryToWgs84(childGeometry, sourceProjection))
        .filter((childGeometry): childGeometry is GeoJSON.Geometry => Boolean(childGeometry)),
    } as GeoJSON.Geometry;
  }

  return {
    ...geometry,
    coordinates: reprojectCoordinatesToWgs84(geometry.coordinates, sourceProjection),
  } as GeoJSON.Geometry;
};

export const reprojectGeoJsonToWgs84 = (geojsonValue: unknown, sourceProjection: GeoPlusSourceProjection): unknown => {
  if (sourceProjection !== "EPSG:3857") {
    return geojsonValue;
  }

  const geojson = asRecord(geojsonValue);
  if (!geojson || typeof geojson.type !== "string") {
    return geojsonValue;
  }

  if (geojson.type === "FeatureCollection") {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    return {
      ...geojson,
      features: features.map((feature) => {
        const featureRecord = asRecord(feature);
        const geometry = reprojectGeometryToWgs84(featureRecord?.geometry, sourceProjection);
        return {
          ...(featureRecord ?? {}),
          type: "Feature",
          geometry,
        };
      }),
    };
  }

  if (geojson.type === "Feature") {
    return {
      ...geojson,
      geometry: reprojectGeometryToWgs84(geojson.geometry, sourceProjection),
    };
  }

  return reprojectGeometryToWgs84(geojson, sourceProjection) ?? geojsonValue;
};
