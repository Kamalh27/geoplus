import * as duckdb from "@duckdb/duckdb-wasm";
import type {
  GeoPlusLayerChartColumn,
  GeoPlusLayerColumnKind,
  GeoPlusLayerDatasetProfile,
  GeoPlusLayerFilterField,
  GeoPlusLayerFilterOption,
  GeoPlusLayerFilterRange,
} from "@/components/geoplus/types";
import { getLocalDuckDbBundles, hasUsableDuckDbBundle, type DuckDbBundle, type ResolvedDuckDbBundle } from "@/lib/geoplus/duckdb-bundles";

type PropertyColumnType = "DOUBLE" | "BOOLEAN" | "TEXT";

type PropertyColumn = {
  originalName: string;
  columnName: string;
  columnType: PropertyColumnType;
};

type PreparedFeatureRow = {
  featureId: number;
  geometryType: string;
  longitude: number | null;
  latitude: number | null;
  geometryJson: string;
  properties: Record<string, unknown>;
};

export type DuckDbChartDataPoint = {
  label: string;
  value: number;
};

export type DuckDbSpatialAnalysisResult = {
  filteredFeatureCollection: GeoJSON.FeatureCollection;
  chartData: DuckDbChartDataPoint[];
  availableColumns: string[];
  whereClause: string;
  chartLabelColumn: string;
  chartColumns: GeoPlusLayerChartColumn[];
  filterFields: GeoPlusLayerFilterField[];
  datasetProfile: GeoPlusLayerDatasetProfile;
  rowCount: number;
};

const BASE_COLUMN_NAMES = ["feature_id", "geometry_type", "longitude", "latitude", "geometry_json"] as const;
const DEFAULT_WHERE_CLAUSE = "TRUE";
const MAX_CATEGORICAL_OPTIONS = 6;
const MAX_FILTER_FIELDS = 6;
const NUMERIC_RANGE_BUCKETS = 4;

const toNumber = (value: unknown): number => {
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

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const escapeSqlString = (value: string) => value.replace(/'/g, "''");

const quoteSqlIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const toColumnKind = (columnType: PropertyColumnType): GeoPlusLayerColumnKind => {
  if (columnType === "DOUBLE") {
    return "number";
  }
  if (columnType === "BOOLEAN") {
    return "boolean";
  }
  return "text";
};

const humanizeColumnName = (value: string) =>
  value
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || value;

const formatReadableNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
};

const buildCategoricalLabelExpression = (columnName: string) => {
  const columnSql = quoteSqlIdentifier(columnName);
  return `COALESCE(NULLIF(CAST(${columnSql} AS VARCHAR), ''), 'Unknown')`;
};

const buildCategoricalPredicate = (columnName: string, kind: GeoPlusLayerColumnKind, value: string) => {
  const columnSql = quoteSqlIdentifier(columnName);

  if (kind === "boolean") {
    if (value === "Unknown") {
      return `${columnSql} IS NULL`;
    }
    return value.toLowerCase() === "true" ? `${columnSql} IS TRUE` : `${columnSql} IS FALSE`;
  }

  if (value === "Unknown") {
    return `${columnSql} IS NULL OR NULLIF(CAST(${columnSql} AS VARCHAR), '') IS NULL`;
  }

  return `${columnSql} = '${escapeSqlString(value)}'`;
};

const combineWhereClauses = (left: string, right: string) => {
  if (!left || left === DEFAULT_WHERE_CLAUSE) {
    return right;
  }
  return `(${left}) AND (${right})`;
};

const toSafeIdentifier = (value: string) => {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "field";
};

const ensureUniqueColumnName = (base: string, usedNames: Set<string>) => {
  let nextName = base;
  let suffix = 2;
  while (usedNames.has(nextName)) {
    nextName = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(nextName);
  return nextName;
};

const inferPropertyColumnType = (values: unknown[]): PropertyColumnType => {
  let numeric = true;
  let logical = true;

  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    if (typeof value === "number") {
      logical = false;
      continue;
    }

    if (typeof value === "bigint") {
      logical = false;
      continue;
    }

    if (typeof value === "boolean") {
      numeric = false;
      continue;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      const numericValue = Number(value);
      if (numeric && Number.isFinite(numericValue)) {
        logical = false;
        continue;
      }
      if (logical && (normalized === "true" || normalized === "false" || normalized === "1" || normalized === "0")) {
        numeric = false;
        continue;
      }
      numeric = false;
      logical = false;
      continue;
    }

    numeric = false;
    logical = false;
  }

  if (numeric) {
    return "DOUBLE";
  }

  if (logical) {
    return "BOOLEAN";
  }

  return "TEXT";
};

const toNumericValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const converted = Number(value.trim());
    return Number.isFinite(converted) ? converted : null;
  }
  return null;
};

const toBooleanValue = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value !== 0;
  }
  if (typeof value === "bigint") {
    return value !== BigInt(0);
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return null;
};

const toTextValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const formatSqlValue = (value: unknown, columnType: "INTEGER" | "DOUBLE" | "BOOLEAN" | "TEXT") => {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (columnType === "INTEGER") {
    const numeric = toNumericValue(value);
    return numeric === null ? "NULL" : String(Math.trunc(numeric));
  }

  if (columnType === "DOUBLE") {
    const numeric = toNumericValue(value);
    return numeric === null ? "NULL" : String(numeric);
  }

  if (columnType === "BOOLEAN") {
    const logical = toBooleanValue(value);
    return logical === null ? "NULL" : logical ? "TRUE" : "FALSE";
  }

  const text = toTextValue(value);
  return text === null ? "NULL" : `'${escapeSqlString(text)}'`;
};

const getRepresentativePoint = (geometry: GeoJSON.Geometry | null | undefined): [number, number] | null => {
  if (!geometry) {
    return null;
  }

  const pickPosition = (candidate: unknown): [number, number] | null => {
    if (!Array.isArray(candidate) || candidate.length < 2) {
      return null;
    }
    const longitude = Number(candidate[0]);
    const latitude = Number(candidate[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }
    return [longitude, latitude];
  };

  if (geometry.type === "Point") {
    return pickPosition(geometry.coordinates);
  }

  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    return pickPosition(geometry.coordinates[0]);
  }

  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return pickPosition(geometry.coordinates[0]?.[0]);
  }

  if (geometry.type === "MultiPolygon") {
    return pickPosition(geometry.coordinates[0]?.[0]?.[0]);
  }

  if (geometry.type === "GeometryCollection") {
    for (const subGeometry of geometry.geometries) {
      const point = getRepresentativePoint(subGeometry);
      if (point) {
        return point;
      }
    }
  }

  return null;
};

const buildPropertyColumns = (features: GeoJSON.Feature[]): PropertyColumn[] => {
  const propertyNames = new Set<string>();

  for (const feature of features) {
    const properties = asRecord(feature.properties);
    if (!properties) {
      continue;
    }
    for (const propertyName of Object.keys(properties)) {
      propertyNames.add(propertyName);
    }
  }

  const usedColumnNames = new Set<string>(BASE_COLUMN_NAMES);
  const columns: PropertyColumn[] = [];

  for (const propertyName of [...propertyNames].sort((left, right) => left.localeCompare(right))) {
    const values = features.map((feature) => {
      const properties = asRecord(feature.properties);
      return properties ? properties[propertyName] : undefined;
    });
    const columnType = inferPropertyColumnType(values);
    const safeBaseName = toSafeIdentifier(propertyName);
    const columnName = ensureUniqueColumnName(safeBaseName, usedColumnNames);
    columns.push({
      originalName: propertyName,
      columnName,
      columnType,
    });
  }

  return columns;
};

const buildPreparedRows = (features: GeoJSON.Feature[]): PreparedFeatureRow[] => {
  return features.map((feature, featureIndex) => {
    const geometryType = feature.geometry?.type ?? "Unknown";
    const representativePoint = getRepresentativePoint(feature.geometry);
    const properties = asRecord(feature.properties) ?? {};

    return {
      featureId: featureIndex,
      geometryType,
      longitude: representativePoint?.[0] ?? null,
      latitude: representativePoint?.[1] ?? null,
      geometryJson: JSON.stringify(feature.geometry ?? null),
      properties,
    };
  });
};

type AnalysisRow = Record<string, unknown> & {
  feature_id: number;
  geometry_type: string;
  longitude: number | null;
  latitude: number | null;
  geometry_json: string;
};

const buildAnalysisRows = (preparedRows: PreparedFeatureRow[], propertyColumns: PropertyColumn[]): AnalysisRow[] =>
  preparedRows.map((row) => {
    const nextRow: AnalysisRow = {
      feature_id: row.featureId,
      geometry_type: row.geometryType,
      longitude: row.longitude,
      latitude: row.latitude,
      geometry_json: row.geometryJson,
    };

    for (const column of propertyColumns) {
      nextRow[column.columnName] = row.properties[column.originalName] ?? null;
    }

    return nextRow;
  });

const trimOuterParentheses = (value: string) => {
  let nextValue = value.trim();

  const isWrappedExpression = (expression: string) => {
    if (!expression.startsWith("(") || !expression.endsWith(")")) {
      return false;
    }

    let depth = 0;
    let inString = false;
    for (let index = 0; index < expression.length; index += 1) {
      const character = expression[index];
      const previousCharacter = expression[index - 1];

      if (character === "'" && previousCharacter !== "\\") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0 && index < expression.length - 1) {
          return false;
        }
      }
    }

    return depth === 0;
  };

  while (isWrappedExpression(nextValue)) {
    nextValue = nextValue.slice(1, -1).trim();
  }

  return nextValue;
};

const splitTopLevelExpression = (value: string, operator: "AND" | "OR") => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previousCharacter = value[index - 1];

    if (character === "'" && previousCharacter !== "\\") {
      inString = !inString;
      current += character;
      continue;
    }

    if (!inString) {
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
      }

      if (
        depth === 0 &&
        value.slice(index, index + operator.length + 2) === ` ${operator} `
      ) {
        parts.push(current.trim());
        current = "";
        index += operator.length + 1;
        continue;
      }
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const getMatchedColumnName = (...matches: Array<string | undefined>) => matches.find((match) => typeof match === "string" && match.length > 0) ?? "";

const parseSqlLiteral = (value: string) => {
  const trimmed = value.trim();
  if (/^'.*'$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  if (trimmed.toUpperCase() === "TRUE") {
    return true;
  }

  if (trimmed.toUpperCase() === "FALSE") {
    return false;
  }

  return trimmed;
};

const buildFallbackPredicate = (value: string): ((row: AnalysisRow) => boolean) => {
  const expression = trimOuterParentheses(value);

  if (!expression || expression.toUpperCase() === DEFAULT_WHERE_CLAUSE) {
    return () => true;
  }

  const orParts = splitTopLevelExpression(expression, "OR");
  if (orParts.length > 1) {
    const evaluators = orParts.map((part) => buildFallbackPredicate(part));
    return (row) => evaluators.some((evaluate) => evaluate(row));
  }

  const andParts = splitTopLevelExpression(expression, "AND");
  if (andParts.length > 1) {
    const evaluators = andParts.map((part) => buildFallbackPredicate(part));
    return (row) => evaluators.every((evaluate) => evaluate(row));
  }

  const nullIfMatch = expression.match(/^NULLIF\(CAST\((?:"([^"]+)"|([a-z_][a-z0-9_]*)) AS VARCHAR\), ''\) IS NULL$/i);
  if (nullIfMatch) {
    const columnName = getMatchedColumnName(nullIfMatch[1], nullIfMatch[2]);
    return (row) => {
      const currentValue = row[columnName];
      return currentValue === null || currentValue === undefined || String(currentValue) === "";
    };
  }

  const isMatch = expression.match(/^(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+IS\s+(TRUE|FALSE|NULL)$/i);
  if (isMatch) {
    const columnName = getMatchedColumnName(isMatch[1], isMatch[2]);
    const testValue = isMatch[3];
    const normalizedTestValue = testValue.toUpperCase();
    return (row) => {
      const currentValue = row[columnName];
      if (normalizedTestValue === "NULL") {
        return currentValue === null || currentValue === undefined;
      }

      const logicalValue = toBooleanValue(currentValue);
      return normalizedTestValue === "TRUE" ? logicalValue === true : logicalValue === false;
    };
  }

  const comparisonMatch = expression.match(/^(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*(=|>=|<=|>|<)\s*(.+)$/i);
  if (comparisonMatch) {
    const columnName = getMatchedColumnName(comparisonMatch[1], comparisonMatch[2]);
    const operator = comparisonMatch[3];
    const rawLiteral = comparisonMatch[4];
    const literalValue = parseSqlLiteral(rawLiteral);

    return (row) => {
      const currentValue = row[columnName];

      if (operator === "=") {
        if (typeof literalValue === "number") {
          return toNumericValue(currentValue) === literalValue;
        }
        if (typeof literalValue === "boolean") {
          return toBooleanValue(currentValue) === literalValue;
        }
        return String(currentValue ?? "") === literalValue;
      }

      const numericCurrentValue = toNumericValue(currentValue);
      const numericLiteralValue = typeof literalValue === "number" ? literalValue : Number.NaN;

      if (!Number.isFinite(numericCurrentValue) || !Number.isFinite(numericLiteralValue)) {
        return false;
      }

      const comparableCurrentValue = numericCurrentValue as number;

      if (operator === ">=") {
        return comparableCurrentValue >= numericLiteralValue;
      }
      if (operator === "<=") {
        return comparableCurrentValue <= numericLiteralValue;
      }
      if (operator === ">") {
        return comparableCurrentValue > numericLiteralValue;
      }
      return comparableCurrentValue < numericLiteralValue;
    };
  }

  throw new Error(`Invalid SQL filter: Unsupported expression "${expression}".`);
};

const buildFallbackCategoricalFilterField = (args: {
  rows: AnalysisRow[];
  columnName: string;
  label: string;
  kind: GeoPlusLayerColumnKind;
}) => {
  const { rows, columnName, label, kind } = args;
  const counts = new Map<string, number>();

  for (const row of rows) {
    const optionLabel =
      kind === "boolean"
        ? toBooleanValue(row[columnName]) === true
          ? "True"
          : toBooleanValue(row[columnName]) === false
            ? "False"
            : "Unknown"
        : row[columnName] === null || row[columnName] === undefined || row[columnName] === ""
          ? "Unknown"
          : String(row[columnName]);

    counts.set(optionLabel, (counts.get(optionLabel) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return null;
  }

  const options = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_CATEGORICAL_OPTIONS)
    .map(([optionLabel, count]) => ({
      label: optionLabel,
      value: optionLabel,
      count,
      predicate: buildCategoricalPredicate(columnName, kind, optionLabel),
    }));

  return {
    columnName,
    label,
    kind,
    distinctCount: counts.size,
    options,
  } satisfies GeoPlusLayerFilterField;
};

const buildFallbackNumericFilterField = (args: {
  rows: AnalysisRow[];
  columnName: string;
  label: string;
}) => {
  const { rows, columnName, label } = args;
  const numericValues = rows
    .map((row) => toNumericValue(row[columnName]))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (numericValues.length === 0) {
    return null;
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  let ranges: GeoPlusLayerFilterRange[] = [];

  if (min === max) {
    ranges = [
      {
        label: formatReadableNumber(min),
        min,
        max,
        count: numericValues.length,
        predicate: `${quoteSqlIdentifier(columnName)} = ${min}`,
      },
    ];
  } else {
    const step = (max - min) / NUMERIC_RANGE_BUCKETS;
    ranges = Array.from({ length: NUMERIC_RANGE_BUCKETS }, (_, index) => {
      const lowerBound = min + step * index;
      const upperBound = index === NUMERIC_RANGE_BUCKETS - 1 ? max : min + step * (index + 1);
      const isLastBucket = index === NUMERIC_RANGE_BUCKETS - 1;
      const count = numericValues.filter((value) =>
        isLastBucket ? value >= lowerBound && value <= upperBound : value >= lowerBound && value < upperBound,
      ).length;

      return {
        label: `${formatReadableNumber(lowerBound)}-${formatReadableNumber(upperBound)}`,
        min: lowerBound,
        max: upperBound,
        count,
        predicate: isLastBucket
          ? `${quoteSqlIdentifier(columnName)} >= ${lowerBound} AND ${quoteSqlIdentifier(columnName)} <= ${upperBound}`
          : `${quoteSqlIdentifier(columnName)} >= ${lowerBound} AND ${quoteSqlIdentifier(columnName)} < ${upperBound}`,
      } satisfies GeoPlusLayerFilterRange;
    }).filter((range) => range.count > 0);
  }

  if (ranges.length === 0) {
    return null;
  }

  return {
    columnName,
    label,
    kind: "number",
    min,
    max,
    ranges,
  } satisfies GeoPlusLayerFilterField;
};

const buildFallbackFilterFields = (args: {
  rows: AnalysisRow[];
  propertyColumns: PropertyColumn[];
}) => {
  const { rows, propertyColumns } = args;
  const categoricalFields: Array<GeoPlusLayerFilterField & { _priority: number }> = [];
  const numericFields: GeoPlusLayerFilterField[] = [];

  const geometryTypeField = buildFallbackCategoricalFilterField({
    rows,
    columnName: "geometry_type",
    label: "Geometry Type",
    kind: "text",
  });

  if (geometryTypeField) {
    categoricalFields.push({
      ...geometryTypeField,
      _priority: 0,
    });
  }

  for (const column of propertyColumns) {
    const kind = toColumnKind(column.columnType);
    const label = humanizeColumnName(column.columnName);

    if (kind === "number") {
      const numericField = buildFallbackNumericFilterField({
        rows,
        columnName: column.columnName,
        label,
      });
      if (numericField) {
        numericFields.push(numericField);
      }
      continue;
    }

    const categoricalField = buildFallbackCategoricalFilterField({
      rows,
      columnName: column.columnName,
      label,
      kind,
    });

    if (!categoricalField) {
      continue;
    }

    const distinctCount = categoricalField.distinctCount ?? Number.MAX_SAFE_INTEGER;
    if (distinctCount <= 1) {
      continue;
    }

    categoricalFields.push({
      ...categoricalField,
      _priority: distinctCount > 12 ? 100 + distinctCount : distinctCount,
    });
  }

  const sortedCategoricalFields = categoricalFields
    .sort((left, right) => left._priority - right._priority || left.label.localeCompare(right.label))
    .map((field) => ({
      columnName: field.columnName,
      label: field.label,
      kind: field.kind,
      distinctCount: field.distinctCount,
      options: field.options,
    }));

  return [...sortedCategoricalFields, ...numericFields].slice(0, MAX_FILTER_FIELDS);
};

const buildFallbackChartData = (args: {
  rows: AnalysisRow[];
  chartLabelColumn: string;
}) => {
  const { rows, chartLabelColumn } = args;
  const counts = new Map<string, number>();

  for (const row of rows) {
    const label = row[chartLabelColumn] === null || row[chartLabelColumn] === undefined || row[chartLabelColumn] === ""
      ? "Unknown"
      : String(row[chartLabelColumn]);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([label, value]) => ({
      label,
      value,
    }));
};

const buildDatasetProfile = (args: {
  sourceFeatures: GeoJSON.Feature[];
  propertyColumns: PropertyColumn[];
  chartColumns: GeoPlusLayerChartColumn[];
  filterFields: GeoPlusLayerFilterField[];
}) => {
  const { sourceFeatures, propertyColumns, chartColumns, filterFields } = args;
  const geometryTypes = [...new Set(sourceFeatures.map((feature) => feature.geometry?.type ?? "Unknown"))].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    featureCount: sourceFeatures.length,
    geometryTypes,
    dimensionColumns: chartColumns
      .filter((column) => column.columnName !== "geometry_type")
      .map((column) => column.label),
    measureColumns: propertyColumns
      .filter((column) => toColumnKind(column.columnType) === "number")
      .map((column) => humanizeColumnName(column.columnName)),
    filterColumns: filterFields.map((field) => field.label),
  } satisfies GeoPlusLayerDatasetProfile;
};

const buildFallbackSpatialAnalysis = (args: {
  sourceFeatures: GeoJSON.Feature[];
  propertyColumns: PropertyColumn[];
  preparedRows: PreparedFeatureRow[];
  whereClause: string;
  requestedChartLabelColumn?: string;
}) => {
  const { sourceFeatures, propertyColumns, preparedRows, whereClause, requestedChartLabelColumn } = args;
  const analysisRows = buildAnalysisRows(preparedRows, propertyColumns);
  const evaluatePredicate = buildFallbackPredicate(whereClause);
  const filteredRows = analysisRows.filter((row) => evaluatePredicate(row));
  const filteredFeatures = filteredRows
    .map((row) => sourceFeatures[row.feature_id])
    .filter((feature): feature is GeoJSON.Feature => Boolean(feature));

  const chartColumns = buildChartColumns(propertyColumns);
  const filterFields = buildFallbackFilterFields({
    rows: filteredRows,
    propertyColumns,
  });
  const chartLabelColumn = resolveChartLabelColumn({
    requestedChartLabelColumn,
    chartColumns,
    filterFields,
  });
  const datasetProfile = buildDatasetProfile({
    sourceFeatures,
    propertyColumns,
    chartColumns,
    filterFields,
  });

  return {
    filteredFeatureCollection: {
      type: "FeatureCollection",
      features: filteredFeatures,
    },
    chartData: buildFallbackChartData({
      rows: filteredRows,
      chartLabelColumn,
    }),
    availableColumns: [...BASE_COLUMN_NAMES, ...propertyColumns.map((column) => column.columnName)],
    whereClause,
    chartLabelColumn,
    chartColumns,
    filterFields,
    datasetProfile,
    rowCount: filteredFeatures.length,
  } satisfies DuckDbSpatialAnalysisResult;
};

const resolveDuckDbBundleCandidates = async (): Promise<ResolvedDuckDbBundle[]> => {
  const bundles = getLocalDuckDbBundles();
  const mvpBundle = bundles.mvp as DuckDbBundle;
  const candidates = [mvpBundle].filter(hasUsableDuckDbBundle);

  if (candidates.length === 0) {
    throw new Error("DuckDB-WASM bundle could not be resolved.");
  }

  const uniqueCandidates: ResolvedDuckDbBundle[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = `${candidate.mainModule}|${candidate.mainWorker}|${candidate.pthreadWorker ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
};

const initializeDuckDb = async () => {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("DuckDB-WASM is only available in the browser.");
  }

  const bundleCandidates = await resolveDuckDbBundleCandidates();
  let lastError: unknown = null;

  for (const bundle of bundleCandidates) {
    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    try {
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? undefined);
      const connection = await db.connect();
      return {
        db,
        worker,
        connection,
      };
    } catch (error) {
      lastError = error;
      worker.terminate();
      try {
        await db.terminate();
      } catch {
        // Ignore failed cleanup for unsuccessful bundle.
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to initialize DuckDB-WASM.");
};

const runFilterQuery = async (connection: duckdb.AsyncDuckDBConnection, whereClause: string) => {
  try {
    return await connection.query(`SELECT feature_id FROM features WHERE ${whereClause} ORDER BY feature_id`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SQL error.";
    throw new Error(`Invalid SQL filter: ${message}`);
  }
};

const runChartQuery = async (connection: duckdb.AsyncDuckDBConnection, whereClause: string, chartLabelColumn: string) => {
  const labelColumnSql = quoteSqlIdentifier(chartLabelColumn);
  return connection.query(`
    SELECT
      COALESCE(NULLIF(CAST(${labelColumnSql} AS VARCHAR), ''), 'Unknown') AS label,
      COUNT(*) AS value
    FROM features
    WHERE ${whereClause}
    GROUP BY 1
    ORDER BY value DESC
    LIMIT 8
  `);
};

const readFirstRow = async (
  queryPromise: Promise<{
    toArray: () => Array<{ toJSON: () => unknown }>;
  }>,
) => {
  const table = await queryPromise;
  const row = table.toArray()[0];
  return row ? (row.toJSON() as Record<string, unknown>) : null;
};

const buildChartColumns = (propertyColumns: PropertyColumn[]): GeoPlusLayerChartColumn[] => {
  const chartColumns: GeoPlusLayerChartColumn[] = [
    {
      columnName: "geometry_type",
      label: "Geometry Type",
      kind: "text",
    },
  ];

  for (const column of propertyColumns) {
    const kind = toColumnKind(column.columnType);
    if (kind === "number") {
      continue;
    }

    chartColumns.push({
      columnName: column.columnName,
      label: humanizeColumnName(column.columnName),
      kind,
    });
  }

  return chartColumns;
};

const buildCategoricalFilterField = async (args: {
  connection: duckdb.AsyncDuckDBConnection;
  columnName: string;
  label: string;
  kind: GeoPlusLayerColumnKind;
  whereClause: string;
}) => {
  const { connection, columnName, label, kind, whereClause } = args;
  const labelSql = buildCategoricalLabelExpression(columnName);

  const distinctRow = await readFirstRow(
    connection.query(`
      SELECT COUNT(*) AS value
      FROM (
        SELECT ${labelSql} AS label
        FROM features
        WHERE ${whereClause}
        GROUP BY 1
      ) grouped_values
    `),
  );

  const distinctCount = toNumber(distinctRow?.value);
  if (distinctCount === 0) {
    return null;
  }

  const optionsTable = await connection.query(`
    SELECT
      ${labelSql} AS label,
      COUNT(*) AS value
    FROM features
    WHERE ${whereClause}
    GROUP BY 1
    ORDER BY value DESC, label ASC
    LIMIT ${MAX_CATEGORICAL_OPTIONS}
  `);

  const options = optionsTable
    .toArray()
    .map((entry) => entry.toJSON() as Record<string, unknown>)
    .map((row) => {
      const optionLabel = String(row.label ?? "Unknown");
      const option: GeoPlusLayerFilterOption = {
        label: optionLabel,
        value: optionLabel,
        count: toNumber(row.value),
        predicate: buildCategoricalPredicate(columnName, kind, optionLabel),
      };
      return option;
    })
    .filter((option) => option.count > 0);

  if (options.length === 0) {
    return null;
  }

  return {
    columnName,
    label,
    kind,
    distinctCount,
    options,
  } satisfies GeoPlusLayerFilterField;
};

const buildNumericFilterField = async (args: {
  connection: duckdb.AsyncDuckDBConnection;
  columnName: string;
  label: string;
  whereClause: string;
}) => {
  const { connection, columnName, label, whereClause } = args;
  const columnSql = quoteSqlIdentifier(columnName);

  const statsRow = await readFirstRow(
    connection.query(`
      SELECT
        MIN(${columnSql}) AS min_value,
        MAX(${columnSql}) AS max_value
      FROM features
      WHERE ${whereClause} AND ${columnSql} IS NOT NULL
    `),
  );

  const min = statsRow?.min_value === null || statsRow?.min_value === undefined ? null : toNumber(statsRow.min_value);
  const max = statsRow?.max_value === null || statsRow?.max_value === undefined ? null : toNumber(statsRow.max_value);

  if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  let ranges: GeoPlusLayerFilterRange[] = [];

  if (min === max) {
    const valueLabel = formatReadableNumber(min);
    const countRow = await readFirstRow(
      connection.query(`
        SELECT COUNT(*) AS value
        FROM features
        WHERE ${combineWhereClauses(whereClause, `${columnSql} = ${min}`)}
      `),
    );

    ranges = [
      {
        label: valueLabel,
        min,
        max,
        count: toNumber(countRow?.value),
        predicate: `${columnSql} = ${min}`,
      },
    ].filter((range) => range.count > 0);
  } else {
    const step = (max - min) / NUMERIC_RANGE_BUCKETS;

    const bucketCountSql = Array.from({ length: NUMERIC_RANGE_BUCKETS }, (_, index) => {
      const lowerBound = min + step * index;
      const upperBound = index === NUMERIC_RANGE_BUCKETS - 1 ? max : min + step * (index + 1);
      const predicate =
        index === NUMERIC_RANGE_BUCKETS - 1
          ? `${columnSql} >= ${lowerBound} AND ${columnSql} <= ${upperBound}`
          : `${columnSql} >= ${lowerBound} AND ${columnSql} < ${upperBound}`;

      return `SUM(CASE WHEN ${predicate} THEN 1 ELSE 0 END) AS bucket_${index}`;
    }).join(", ");

    const bucketRow = await readFirstRow(
      connection.query(`
        SELECT ${bucketCountSql}
        FROM features
        WHERE ${whereClause} AND ${columnSql} IS NOT NULL
      `),
    );

    ranges = Array.from({ length: NUMERIC_RANGE_BUCKETS }, (_, index) => {
      const lowerBound = min + step * index;
      const upperBound = index === NUMERIC_RANGE_BUCKETS - 1 ? max : min + step * (index + 1);
      const isLastBucket = index === NUMERIC_RANGE_BUCKETS - 1;
      const predicate = isLastBucket
        ? `${columnSql} >= ${lowerBound} AND ${columnSql} <= ${upperBound}`
        : `${columnSql} >= ${lowerBound} AND ${columnSql} < ${upperBound}`;

      return {
        label: `${formatReadableNumber(lowerBound)}-${formatReadableNumber(upperBound)}`,
        min: lowerBound,
        max: upperBound,
        count: toNumber(bucketRow?.[`bucket_${index}`]),
        predicate,
      } satisfies GeoPlusLayerFilterRange;
    }).filter((range) => range.count > 0);
  }

  if (ranges.length === 0) {
    return null;
  }

  return {
    columnName,
    label,
    kind: "number",
    min,
    max,
    ranges,
  } satisfies GeoPlusLayerFilterField;
};

const buildFilterFields = async (args: {
  connection: duckdb.AsyncDuckDBConnection;
  propertyColumns: PropertyColumn[];
  whereClause: string;
}) => {
  const { connection, propertyColumns, whereClause } = args;
  const categoricalFields: Array<GeoPlusLayerFilterField & { _priority: number }> = [];
  const numericFields: GeoPlusLayerFilterField[] = [];

  const geometryTypeField = await buildCategoricalFilterField({
    connection,
    columnName: "geometry_type",
    label: "Geometry Type",
    kind: "text",
    whereClause,
  });

  if (geometryTypeField) {
    categoricalFields.push({
      ...geometryTypeField,
      _priority: 0,
    });
  }

  for (const column of propertyColumns) {
    const kind = toColumnKind(column.columnType);
    const label = humanizeColumnName(column.columnName);

    if (kind === "number") {
      const numericField = await buildNumericFilterField({
        connection,
        columnName: column.columnName,
        label,
        whereClause,
      });
      if (numericField) {
        numericFields.push(numericField);
      }
      continue;
    }

    const categoricalField = await buildCategoricalFilterField({
      connection,
      columnName: column.columnName,
      label,
      kind,
      whereClause,
    });

    if (!categoricalField) {
      continue;
    }

    const distinctCount = categoricalField.distinctCount ?? Number.MAX_SAFE_INTEGER;
    if (distinctCount <= 1) {
      continue;
    }

    const relevanceScore = distinctCount > 12 ? 100 + distinctCount : distinctCount;
    categoricalFields.push({
      ...categoricalField,
      _priority: relevanceScore,
    });
  }

  const sortedCategoricalFields = categoricalFields
    .sort((left, right) => left._priority - right._priority || left.label.localeCompare(right.label))
    .map((field) => ({
      columnName: field.columnName,
      label: field.label,
      kind: field.kind,
      distinctCount: field.distinctCount,
      options: field.options,
    }));

  return [...sortedCategoricalFields, ...numericFields].slice(0, MAX_FILTER_FIELDS);
};

const resolveChartLabelColumn = (args: {
  requestedChartLabelColumn?: string;
  chartColumns: GeoPlusLayerChartColumn[];
  filterFields: GeoPlusLayerFilterField[];
}) => {
  const { requestedChartLabelColumn, chartColumns, filterFields } = args;
  if (requestedChartLabelColumn && chartColumns.some((column) => column.columnName === requestedChartLabelColumn)) {
    return requestedChartLabelColumn;
  }

  const preferredField =
    filterFields.find((field) => field.kind !== "number" && field.columnName !== "geometry_type") ??
    filterFields.find((field) => field.kind !== "number");
  if (preferredField && chartColumns.some((column) => column.columnName === preferredField.columnName)) {
    return preferredField.columnName;
  }

  return chartColumns[0]?.columnName ?? "geometry_type";
};

export const isGeoJsonFeatureCollection = (value: unknown): value is GeoJSON.FeatureCollection => {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  return record.type === "FeatureCollection" && Array.isArray(record.features);
};

export const runDuckDbSpatialAnalysis = async (args: {
  sourceFeatureCollection: GeoJSON.FeatureCollection;
  whereClause?: string;
  chartLabelColumn?: string;
}): Promise<DuckDbSpatialAnalysisResult> => {
  const sourceFeatures = Array.isArray(args.sourceFeatureCollection.features) ? args.sourceFeatureCollection.features : [];
  const whereClause = args.whereClause?.trim() || DEFAULT_WHERE_CLAUSE;

  if (sourceFeatures.length === 0) {
    return {
      filteredFeatureCollection: {
        type: "FeatureCollection",
        features: [],
      },
      chartData: [],
      availableColumns: [...BASE_COLUMN_NAMES],
      whereClause,
      chartLabelColumn: "geometry_type",
      chartColumns: [{ columnName: "geometry_type", label: "Geometry Type", kind: "text" }],
      filterFields: [],
      datasetProfile: {
        featureCount: 0,
        geometryTypes: [],
        dimensionColumns: [],
        measureColumns: [],
        filterColumns: [],
      },
      rowCount: 0,
    };
  }

  const propertyColumns = buildPropertyColumns(sourceFeatures);
  const preparedRows = buildPreparedRows(sourceFeatures);
  const featureById = new Map<number, GeoJSON.Feature>();
  for (const row of preparedRows) {
    featureById.set(row.featureId, sourceFeatures[row.featureId]);
  }

  if (typeof window !== "undefined") {
    return buildFallbackSpatialAnalysis({
      sourceFeatures,
      propertyColumns,
      preparedRows,
      whereClause,
      requestedChartLabelColumn: args.chartLabelColumn,
    });
  }

  const { db, worker, connection } = await initializeDuckDb();
  try {
    const createColumnSql = [
      `${quoteSqlIdentifier("feature_id")} INTEGER`,
      `${quoteSqlIdentifier("geometry_type")} TEXT`,
      `${quoteSqlIdentifier("longitude")} DOUBLE`,
      `${quoteSqlIdentifier("latitude")} DOUBLE`,
      `${quoteSqlIdentifier("geometry_json")} TEXT`,
      ...propertyColumns.map((column) => `${quoteSqlIdentifier(column.columnName)} ${column.columnType}`),
    ].join(", ");

    await connection.query(`CREATE TABLE features (${createColumnSql})`);

    const insertColumns = [
      "feature_id",
      "geometry_type",
      "longitude",
      "latitude",
      "geometry_json",
      ...propertyColumns.map((column) => column.columnName),
    ];
    const insertColumnsSql = insertColumns.map((columnName) => quoteSqlIdentifier(columnName)).join(", ");

    const chunkSize = 400;
    for (let start = 0; start < preparedRows.length; start += chunkSize) {
      const rows = preparedRows.slice(start, start + chunkSize);
      const valuesSql = rows
        .map((row) => {
          const baseValues = [
            formatSqlValue(row.featureId, "INTEGER"),
            formatSqlValue(row.geometryType, "TEXT"),
            formatSqlValue(row.longitude, "DOUBLE"),
            formatSqlValue(row.latitude, "DOUBLE"),
            formatSqlValue(row.geometryJson, "TEXT"),
          ];

          const propertyValues = propertyColumns.map((column) => {
            const rawValue = row.properties[column.originalName];
            return formatSqlValue(rawValue, column.columnType);
          });

          return `(${[...baseValues, ...propertyValues].join(", ")})`;
        })
        .join(", ");

      await connection.query(`INSERT INTO features (${insertColumnsSql}) VALUES ${valuesSql}`);
    }

    const filteredIdTable = await runFilterQuery(connection, whereClause);
    const filteredIds = filteredIdTable
      .toArray()
      .map((entry) => entry.toJSON() as Record<string, unknown>)
      .map((row) => toNumber(row.feature_id))
      .filter((value) => Number.isInteger(value));

    const filteredFeatures = filteredIds
      .map((featureId) => featureById.get(featureId))
      .filter((feature): feature is GeoJSON.Feature => Boolean(feature));

    const chartColumns = buildChartColumns(propertyColumns);
    const filterFields = await buildFilterFields({
      connection,
      propertyColumns,
      whereClause,
    });
    const chartLabelColumn = resolveChartLabelColumn({
      requestedChartLabelColumn: args.chartLabelColumn,
      chartColumns,
      filterFields,
    });
    const datasetProfile = buildDatasetProfile({
      sourceFeatures,
      propertyColumns,
      chartColumns,
      filterFields,
    });
    const chartTable = await runChartQuery(connection, whereClause, chartLabelColumn);
    const chartData = chartTable
      .toArray()
      .map((entry) => entry.toJSON() as Record<string, unknown>)
      .map((row) => ({
        label: String(row.label ?? "Unknown"),
        value: toNumber(row.value),
      }));

    return {
      filteredFeatureCollection: {
        type: "FeatureCollection",
        features: filteredFeatures,
      },
      chartData,
      availableColumns: [...BASE_COLUMN_NAMES, ...propertyColumns.map((column) => column.columnName)],
      whereClause,
      chartLabelColumn,
      chartColumns,
      filterFields,
      datasetProfile,
      rowCount: filteredFeatures.length,
    };
  } finally {
    try {
      await connection.close();
    } catch {
      // Ignore failed connection cleanup.
    }
    await db.terminate();
    worker.terminate();
  }
};
