import * as turf from "@turf/turf";
import type { GeoPlusSpatialAnalysisOperation, GeoPlusSpatialBufferUnit } from "@/components/geoplus/types";

type BBox = [minLongitude: number, minLatitude: number, maxLongitude: number, maxLatitude: number];
type Position = [longitude: number, latitude: number];

export type RunBasicSpatialAnalysisArgs = {
  sourceFeatureCollection: GeoJSON.FeatureCollection;
  operation: GeoPlusSpatialAnalysisOperation;
  bufferDistance?: number;
  bufferUnit?: GeoPlusSpatialBufferUnit;
  clipFeatureCollection?: GeoJSON.FeatureCollection;
  tolerance?: number;
  iterations?: number;
};

export type BasicSpatialAnalysisResult = {
  featureCollection: GeoJSON.FeatureCollection;
  summary: string;
};

const EARTH_RADIUS_KM = 6371.0088;
const CIRCLE_STEPS = 36;

const toRadians = (value: number) => (value * Math.PI) / 180;
const toDegrees = (value: number) => (value * 180) / Math.PI;

const asPosition = (value: unknown): Position | null => {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return [longitude, latitude];
};

const cloneProperties = (properties: GeoJSON.GeoJsonProperties | null | undefined): GeoJSON.GeoJsonProperties =>
  properties ? { ...properties } : {};

const appendPosition = (positions: Position[], nextPosition: Position) => {
  const previousPosition = positions.at(-1);
  if (previousPosition && previousPosition[0] === nextPosition[0] && previousPosition[1] === nextPosition[1]) {
    return;
  }
  positions.push(nextPosition);
};

const ensureClosedRing = (positions: Position[]): Position[] => {
  if (positions.length === 0) {
    return positions;
  }

  const firstPosition = positions[0];
  const lastPosition = positions.at(-1);
  if (!firstPosition || !lastPosition) {
    return positions;
  }

  if (firstPosition[0] === lastPosition[0] && firstPosition[1] === lastPosition[1]) {
    return positions;
  }

  return [...positions, firstPosition];
};

const convertDistanceToKilometers = (distance: number, unit: GeoPlusSpatialBufferUnit) => {
  if (unit === "meters") {
    return distance / 1000;
  }
  if (unit === "miles") {
    return distance * 1.609344;
  }
  return distance;
};

const getGeometryBbox = (geometry: GeoJSON.Geometry | null | undefined): BBox | null => {
  if (!geometry) {
    return null;
  }

  const nextBounds: BBox = [Infinity, Infinity, -Infinity, -Infinity];

  const visitCoordinates = (value: unknown): void => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const longitude = Number(value[0]);
      const latitude = Number(value[1]);
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        nextBounds[0] = Math.min(nextBounds[0], longitude);
        nextBounds[1] = Math.min(nextBounds[1], latitude);
        nextBounds[2] = Math.max(nextBounds[2], longitude);
        nextBounds[3] = Math.max(nextBounds[3], latitude);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visitCoordinates(entry);
      }
    }
  };

  if (geometry.type === "GeometryCollection") {
    for (const entry of geometry.geometries) {
      const entryBounds = getGeometryBbox(entry);
      if (!entryBounds) {
        continue;
      }
      nextBounds[0] = Math.min(nextBounds[0], entryBounds[0]);
      nextBounds[1] = Math.min(nextBounds[1], entryBounds[1]);
      nextBounds[2] = Math.max(nextBounds[2], entryBounds[2]);
      nextBounds[3] = Math.max(nextBounds[3], entryBounds[3]);
    }
  } else {
    visitCoordinates(geometry.coordinates);
  }

  return Number.isFinite(nextBounds[0]) ? nextBounds : null;
};

const getFeatureCollectionBbox = (featureCollection: GeoJSON.FeatureCollection): BBox | null => {
  const nextBounds: BBox = [Infinity, Infinity, -Infinity, -Infinity];

  for (const feature of featureCollection.features ?? []) {
    const featureBounds = getGeometryBbox(feature.geometry);
    if (!featureBounds) {
      continue;
    }

    nextBounds[0] = Math.min(nextBounds[0], featureBounds[0]);
    nextBounds[1] = Math.min(nextBounds[1], featureBounds[1]);
    nextBounds[2] = Math.max(nextBounds[2], featureBounds[2]);
    nextBounds[3] = Math.max(nextBounds[3], featureBounds[3]);
  }

  return Number.isFinite(nextBounds[0]) ? nextBounds : null;
};

const bboxToPolygon = (bbox: BBox): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [[
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [bbox[0], bbox[3]],
    [bbox[0], bbox[1]],
  ]],
});

const expandBbox = (bbox: BBox, distanceKilometers: number): BBox => {
  const centerLatitude = (bbox[1] + bbox[3]) / 2;
  const latitudeDelta = distanceKilometers / 110.574;
  const longitudeDivisor = Math.max(0.1, 111.320 * Math.cos(toRadians(centerLatitude)));
  const longitudeDelta = distanceKilometers / longitudeDivisor;

  return [
    bbox[0] - longitudeDelta,
    bbox[1] - latitudeDelta,
    bbox[2] + longitudeDelta,
    bbox[3] + latitudeDelta,
  ];
};

const createCircleRing = (center: Position, distanceKilometers: number, steps = CIRCLE_STEPS): Position[] => {
  const [longitude, latitude] = center;
  const latitudeRadians = toRadians(latitude);
  const longitudeRadians = toRadians(longitude);
  const angularDistance = distanceKilometers / EARTH_RADIUS_KM;
  const coordinates: Position[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const nextLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance) +
        Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const nextLongitude =
      longitudeRadians +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
        Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(nextLatitude),
      );

    coordinates.push([toDegrees(nextLongitude), toDegrees(nextLatitude)]);
  }

  return coordinates;
};

const bufferGeometry = (geometry: GeoJSON.Geometry, distanceKilometers: number): GeoJSON.Geometry | null => {
  if (geometry.type === "Point") {
    const center = asPosition(geometry.coordinates);
    return center
      ? {
          type: "Polygon",
          coordinates: [createCircleRing(center, distanceKilometers)],
        }
      : null;
  }

  if (geometry.type === "MultiPoint") {
    const polygons = geometry.coordinates
      .map((coordinates) => asPosition(coordinates))
      .filter((coordinates): coordinates is Position => Boolean(coordinates))
      .map((coordinates) => [createCircleRing(coordinates, distanceKilometers)]);

    if (polygons.length === 0) {
      return null;
    }

    return polygons.length === 1
      ? {
          type: "Polygon",
          coordinates: polygons[0],
        }
      : {
          type: "MultiPolygon",
          coordinates: polygons,
        };
  }

  if (geometry.type === "GeometryCollection") {
    const geometries = geometry.geometries
      .map((entry) => bufferGeometry(entry, distanceKilometers))
      .filter((entry): entry is GeoJSON.Geometry => Boolean(entry));

    if (geometries.length === 0) {
      return null;
    }

    return {
      type: "GeometryCollection",
      geometries,
    };
  }

  const bbox = getGeometryBbox(geometry);
  if (!bbox) {
    return null;
  }

  return bboxToPolygon(expandBbox(bbox, distanceKilometers));
};

const isInsideBbox = (position: Position, bbox: BBox) =>
  position[0] >= bbox[0] && position[0] <= bbox[2] && position[1] >= bbox[1] && position[1] <= bbox[3];

const clipSegmentToBbox = (start: Position, end: Position, bbox: BBox): [Position, Position] | null => {
  const [minX, minY, maxX, maxY] = bbox;
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  let startFraction = 0;
  let endFraction = 1;

  const updateFractions = (p: number, q: number) => {
    if (p === 0) {
      return q >= 0;
    }

    const ratio = q / p;
    if (p < 0) {
      if (ratio > endFraction) {
        return false;
      }
      if (ratio > startFraction) {
        startFraction = ratio;
      }
      return true;
    }

    if (ratio < startFraction) {
      return false;
    }
    if (ratio < endFraction) {
      endFraction = ratio;
    }
    return true;
  };

  if (
    !updateFractions(-deltaX, start[0] - minX) ||
    !updateFractions(deltaX, maxX - start[0]) ||
    !updateFractions(-deltaY, start[1] - minY) ||
    !updateFractions(deltaY, maxY - start[1])
  ) {
    return null;
  }

  const nextStart: Position = [start[0] + startFraction * deltaX, start[1] + startFraction * deltaY];
  const nextEnd: Position = [start[0] + endFraction * deltaX, start[1] + endFraction * deltaY];
  return [nextStart, nextEnd];
};

const clipLineStringCoordinates = (coordinates: Position[], bbox: BBox): Position[][] => {
  if (coordinates.length < 2) {
    return [];
  }

  const segments: Position[][] = [];
  let currentSegment: Position[] = [];

  const flushCurrentSegment = () => {
    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }
    currentSegment = [];
  };

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    if (!start || !end) {
      continue;
    }

    const clippedSegment = clipSegmentToBbox(start, end, bbox);
    if (!clippedSegment) {
      flushCurrentSegment();
      continue;
    }

    if (currentSegment.length === 0) {
      currentSegment.push(clippedSegment[0], clippedSegment[1]);
      continue;
    }

    appendPosition(currentSegment, clippedSegment[0]);
    appendPosition(currentSegment, clippedSegment[1]);
  }

  flushCurrentSegment();
  return segments;
};

type ClipEdge = "left" | "right" | "bottom" | "top";

const isInsideEdge = (position: Position, bbox: BBox, edge: ClipEdge) => {
  if (edge === "left") {
    return position[0] >= bbox[0];
  }
  if (edge === "right") {
    return position[0] <= bbox[2];
  }
  if (edge === "bottom") {
    return position[1] >= bbox[1];
  }
  return position[1] <= bbox[3];
};

const intersectEdge = (start: Position, end: Position, bbox: BBox, edge: ClipEdge): Position => {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];

  if (edge === "left" || edge === "right") {
    const boundaryX = edge === "left" ? bbox[0] : bbox[2];
    if (deltaX === 0) {
      return [boundaryX, start[1]];
    }
    const ratio = (boundaryX - start[0]) / deltaX;
    return [boundaryX, start[1] + ratio * deltaY];
  }

  const boundaryY = edge === "bottom" ? bbox[1] : bbox[3];
  if (deltaY === 0) {
    return [start[0], boundaryY];
  }
  const ratio = (boundaryY - start[1]) / deltaY;
  return [start[0] + ratio * deltaX, boundaryY];
};

const clipRingToBbox = (coordinates: Position[], bbox: BBox): Position[] | null => {
  let output = ensureClosedRing(coordinates).slice(0, -1);
  if (output.length < 3) {
    return null;
  }

  for (const edge of ["left", "right", "bottom", "top"] as const) {
    const input = output;
    output = [];
    if (input.length === 0) {
      break;
    }

    let previous = input.at(-1);
    for (const current of input) {
      if (!previous) {
        previous = current;
        continue;
      }

      const currentInside = isInsideEdge(current, bbox, edge);
      const previousInside = isInsideEdge(previous, bbox, edge);

      if (currentInside) {
        if (!previousInside) {
          output.push(intersectEdge(previous, current, bbox, edge));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(intersectEdge(previous, current, bbox, edge));
      }

      previous = current;
    }
  }

  const closedOutput = ensureClosedRing(output);
  return closedOutput.length >= 4 ? closedOutput : null;
};

const clipGeometryToBbox = (geometry: GeoJSON.Geometry | null | undefined, bbox: BBox): GeoJSON.Geometry | null => {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point") {
    const position = asPosition(geometry.coordinates);
    return position && isInsideBbox(position, bbox) ? geometry : null;
  }

  if (geometry.type === "MultiPoint") {
    const coordinates = geometry.coordinates
      .map((coordinate) => asPosition(coordinate))
      .filter((coordinate): coordinate is Position => coordinate !== null && isInsideBbox(coordinate, bbox));

    if (coordinates.length === 0) {
      return null;
    }

    return coordinates.length === 1
      ? {
          type: "Point",
          coordinates: coordinates[0],
        }
      : {
          type: "MultiPoint",
          coordinates,
        };
  }

  if (geometry.type === "LineString") {
    const segments = clipLineStringCoordinates(geometry.coordinates as Position[], bbox);
    if (segments.length === 0) {
      return null;
    }

    return segments.length === 1
      ? {
          type: "LineString",
          coordinates: segments[0],
        }
      : {
          type: "MultiLineString",
          coordinates: segments,
        };
  }

  if (geometry.type === "MultiLineString") {
    const segments = geometry.coordinates.flatMap((line) => clipLineStringCoordinates(line as Position[], bbox));
    if (segments.length === 0) {
      return null;
    }

    return segments.length === 1
      ? {
          type: "LineString",
          coordinates: segments[0],
        }
      : {
          type: "MultiLineString",
          coordinates: segments,
        };
  }

  if (geometry.type === "Polygon") {
    const exteriorRing = clipRingToBbox(geometry.coordinates[0] as Position[], bbox);
    if (!exteriorRing) {
      return null;
    }

    const holes = geometry.coordinates
      .slice(1)
      .map((ring) => clipRingToBbox(ring as Position[], bbox))
      .filter((ring): ring is Position[] => Boolean(ring));

    return {
      type: "Polygon",
      coordinates: [exteriorRing, ...holes],
    };
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates
      .map((polygon) => {
        const exteriorRing = clipRingToBbox(polygon[0] as Position[], bbox);
        if (!exteriorRing) {
          return null;
        }

        const holes = polygon
          .slice(1)
          .map((ring) => clipRingToBbox(ring as Position[], bbox))
          .filter((ring): ring is Position[] => Boolean(ring));

        return [exteriorRing, ...holes];
      })
      .filter((polygon): polygon is Position[][] => Boolean(polygon));

    if (polygons.length === 0) {
      return null;
    }

    return polygons.length === 1
      ? {
          type: "Polygon",
          coordinates: polygons[0],
        }
      : {
          type: "MultiPolygon",
          coordinates: polygons,
        };
  }

  const geometries = geometry.geometries
    .map((entry) => clipGeometryToBbox(entry, bbox))
    .filter((entry): entry is GeoJSON.Geometry => Boolean(entry));

  if (geometries.length === 0) {
    return null;
  }

  return {
    type: "GeometryCollection",
    geometries,
  };
};

const runBufferAnalysis = (args: RunBasicSpatialAnalysisArgs): BasicSpatialAnalysisResult => {
  const distance = Number(args.bufferDistance);
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("Enter a positive buffer distance to create a derived layer.");
  }

  const bufferUnit = args.bufferUnit ?? "kilometers";
  const distanceKilometers = convertDistanceToKilometers(distance, bufferUnit);
  const features = (args.sourceFeatureCollection.features ?? [])
    .map((feature) => {
      const nextGeometry = feature.geometry ? bufferGeometry(feature.geometry, distanceKilometers) : null;
      if (!nextGeometry) {
        return null;
      }

      return {
        type: "Feature",
        properties: {
          ...cloneProperties(feature.properties),
          analysis_operation: "buffer",
          analysis_distance: distance,
          analysis_unit: bufferUnit,
        },
        geometry: nextGeometry,
      } as GeoJSON.Feature;
    })
    .filter((feature): feature is GeoJSON.Feature => feature !== null);

  return {
    featureCollection: {
      type: "FeatureCollection",
      features,
    },
    summary: `Buffered ${features.length} feature${features.length === 1 ? "" : "s"} by ${distance} ${bufferUnit}.`,
  };
};

const runClipAnalysis = (args: RunBasicSpatialAnalysisArgs): BasicSpatialAnalysisResult => {
  const clipFeatureCollection = args.clipFeatureCollection;
  if (!clipFeatureCollection) {
    throw new Error("Choose a clip layer before running the clip analysis.");
  }

  const clipBounds = getFeatureCollectionBbox(clipFeatureCollection);
  if (!clipBounds) {
    throw new Error("The selected clip layer does not have a usable spatial extent.");
  }

  const features = (args.sourceFeatureCollection.features ?? [])
    .map((feature) => {
      const nextGeometry = clipGeometryToBbox(feature.geometry, clipBounds);
      if (!nextGeometry) {
        return null;
      }

      return {
        type: "Feature",
        properties: {
          ...cloneProperties(feature.properties),
          analysis_operation: "clip",
        },
        geometry: nextGeometry,
      } as GeoJSON.Feature;
    })
    .filter((feature): feature is GeoJSON.Feature => feature !== null);

  return {
    featureCollection: {
      type: "FeatureCollection",
      features,
    },
    summary: `Clipped ${features.length} feature${features.length === 1 ? "" : "s"} to the selected layer extent.`,
  };
};

const runSimplifyAnalysis = (args: RunBasicSpatialAnalysisArgs): BasicSpatialAnalysisResult => {
  const tolerance = args.tolerance ?? 0.01;
  const features = (args.sourceFeatureCollection.features ?? [])
    .map((feature) => {
      try {
        const simplified = turf.simplify(feature, { tolerance, highQuality: true });
        return {
          ...simplified,
          properties: {
            ...cloneProperties(feature.properties),
            analysis_operation: "simplify",
            analysis_tolerance: tolerance,
          },
        } as GeoJSON.Feature;
      } catch (e) {
        console.error("Simplify failed for feature", feature.id, e);
        return null;
      }
    })
    .filter((feature): feature is GeoJSON.Feature => feature !== null);

  return {
    featureCollection: {
      type: "FeatureCollection",
      features,
    },
    summary: `Simplified ${features.length} feature${features.length === 1 ? "" : "s"} with tolerance ${tolerance}.`,
  };
};

const sanitizePolygonForRendering = (
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null => {
  let cleaned = turf.cleanCoords(feature, { mutate: false }) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  cleaned = turf.rewind(cleaned, { reverse: false, mutate: false }) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  if (!turf.booleanValid(cleaned)) {
    return null;
  }

  const area = turf.area(cleaned);
  if (!Number.isFinite(area) || area <= 0) {
    return null;
  }

  return cleaned;
};

const runSmoothAnalysis = (args: RunBasicSpatialAnalysisArgs): BasicSpatialAnalysisResult => {
  const iterations = args.iterations ?? 2;
  const features = (args.sourceFeatureCollection.features ?? [])
    .map((feature) => {
      try {
        let smoothed: GeoJSON.Feature | null = null;
        if (feature.geometry.type === "LineString") {
          // turf.bezierSpline doesn't use iterations directly in the same way, but we can pass it as resolution if we want, or just stick to polygonSmooth.
          // For simplicity, we apply it to polygonSmooth.
          smoothed = turf.bezierSpline(feature as GeoJSON.Feature<GeoJSON.LineString>);
        } else if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
          const smoothedResult = turf.polygonSmooth(feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, { iterations });
          const validSmoothedGeometries = smoothedResult.features
            .map((smoothedFeature) =>
              sanitizePolygonForRendering(smoothedFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>),
            )
            .filter((candidate): candidate is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> => candidate !== null)
            .flatMap((candidate) =>
              candidate.geometry.type === "Polygon" ? [candidate.geometry.coordinates] : candidate.geometry.coordinates,
            );

          if (validSmoothedGeometries.length === 1) {
            smoothed = {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: validSmoothedGeometries[0],
              },
            };
          } else if (validSmoothedGeometries.length > 1) {
            smoothed = {
              type: "Feature",
              properties: {},
              geometry: {
                type: "MultiPolygon",
                coordinates: validSmoothedGeometries,
              },
            };
          } else {
            smoothed = sanitizePolygonForRendering(feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>);
          }
        } else {
          smoothed = { ...feature } as GeoJSON.Feature;
        }

        if (!smoothed) return null;

        return {
          ...smoothed,
          properties: {
            ...cloneProperties(feature.properties),
            analysis_operation: "smooth",
            analysis_iterations: iterations,
          },
        } as GeoJSON.Feature;
      } catch (e) {
        console.error("Smooth failed for feature", feature.id, e);
        return null;
      }
    })
    .filter((feature): feature is GeoJSON.Feature => feature !== null);

  return {
    featureCollection: {
      type: "FeatureCollection",
      features,
    },
    summary: `Smoothed ${features.length} feature${features.length === 1 ? "" : "s"} with ${iterations} iteration${iterations === 1 ? "" : "s"}.`,
  };
};

const runFixGeometryAnalysis = (args: RunBasicSpatialAnalysisArgs): BasicSpatialAnalysisResult => {
  const features = (args.sourceFeatureCollection.features ?? [])
    .map((feature) => {
      try {
        // Rewind ensures right-hand rule for polygons
        const fixed = turf.rewind(feature, { reverse: false, mutate: false });
        return {
          ...fixed,
          properties: {
            ...cloneProperties(feature.properties),
            analysis_operation: "fix_geometry",
            ...(args.tolerance !== undefined && { analysis_tolerance: args.tolerance }),
            ...(args.iterations !== undefined && { analysis_iterations: args.iterations }),
          },
        } as GeoJSON.Feature;
      } catch (e) {
        console.error("Fix geometry failed for feature", feature.id, e);
        return null;
      }
    })
    .filter((feature): feature is GeoJSON.Feature => feature !== null);

  return {
    featureCollection: {
      type: "FeatureCollection",
      features,
    },
    summary: `Fixed geometry for ${features.length} feature${features.length === 1 ? "" : "s"}.`,
  };
};

export const runBasicSpatialAnalysis = (args: RunBasicSpatialAnalysisArgs): BasicSpatialAnalysisResult => {
  const sourceFeatures = args.sourceFeatureCollection.features ?? [];
  if (sourceFeatures.length === 0) {
    throw new Error("Add a non-empty vector layer before running analysis.");
  }

  switch (args.operation) {
    case "buffer":
      return runBufferAnalysis(args);
    case "clip":
      return runClipAnalysis(args);
    case "simplify":
      return runSimplifyAnalysis(args);
    case "smooth":
      return runSmoothAnalysis(args);
    case "fix_geometry":
      return runFixGeometryAnalysis(args);
    default:
      throw new Error(`Unsupported spatial analysis operation: ${args.operation}`);
  }
};
