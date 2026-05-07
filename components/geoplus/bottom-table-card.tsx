"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChartNoAxesColumn, ChevronDown, Expand, Filter, Search, Table2, X, ZoomIn, Minimize2, Download, Terminal, Settings2, Database } from "lucide-react";

import { GeoPlusEchartsInsightChart, type GeoPlusEchartsInsightChartHandle } from "@/components/geoplus/echarts-insight-chart";
import { DuckDbShell } from "@/components/geoplus/duckdb-shell";
import {
  chartPalettes,
  chartTypeOptions,
  toSafeChartFileBase,
  type ChartPaletteId,
  type ChartType,
  type InsightChartDatum,
} from "@/components/geoplus/insight-chart-config";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { isGeoJsonFeatureCollection } from "@/lib/geoplus/duckdb-spatial-analytics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type GeoPlusBottomTableCardProps = {
  activeTab?: "table" | "shell" | "none";
  onTabChange?: (tab: "table" | "shell" | "none") => void;
  onClose?: () => void;
  isVisible?: boolean;
  layer: GeoPlusLayerItem | null;
  layers?: GeoPlusLayerItem[];
  onSelectLayer?: (layerId: string) => void;
  reserveRightPanelSpace?: boolean;
  onZoomToFeature?: (feature: GeoJSON.Feature) => void;
  onApplyFilter?: (layerId: string, whereClause: string) => void;
};

type TableRow = {
  feature: GeoJSON.Feature;
  values: Record<string, unknown>;
};

type SortDirection = "asc" | "desc" | null;
type ColumnPopoverMode = "search" | "filter";
type ColumnPopoverState = {
  columnName: string;
  mode: ColumnPopoverMode;
} | null;
type ColumnKind = "number" | "text" | "boolean";
type NumericFilterOperator = "gt" | "lt" | "eq" | "between";
type TextFilterOperator = "contains" | "equals" | "startsWith";
type BooleanFilterOperator = "is";
type FilterOperator = NumericFilterOperator | TextFilterOperator | BooleanFilterOperator;
type ColumnFilterCondition = {
  operator: FilterOperator;
  value: string;
  secondValue?: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const capitalizeWords = (value: string) => {
  const normalized = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  if (!normalized) {
    return value;
  }
  return normalized
    .split(/\s+/)
    .map((word) => (word.length > 0 ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
};

const toFeatureCollection = (layer: GeoPlusLayerItem): GeoJSON.FeatureCollection | null => {
  if (isGeoJsonFeatureCollection(layer.inlineData)) {
    return layer.inlineData;
  }
  if (isGeoJsonFeatureCollection(layer.rawInlineData)) {
    return layer.rawInlineData;
  }
  return null;
};

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) || typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      return serialized.length > 64 ? `${serialized.slice(0, 64)}...` : serialized;
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const formatCellDisplayValue = (value: unknown) => {
  if (typeof value === "string") {
    return capitalizeWords(formatCellValue(value));
  }
  return formatCellValue(value);
};

const toComparableValue = (value: unknown): number | string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return formatCellValue(value).toLowerCase();
};

const formatColumnLabel = (columnName: string) => capitalizeWords(columnName);

const buildChartData = (rows: TableRow[], columnName: string): InsightChartDatum[] => {
  const counter = new Map<string, number>();

  for (const row of rows) {
    const label = formatCellDisplayValue(row.values[columnName]);
    counter.set(label, (counter.get(label) ?? 0) + 1);
  }

  return [...counter.entries()]
    .map(([label, count]) => ({ label, value: count }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
};

const getColumnPopoverKey = (columnName: string, mode: ColumnPopoverMode) => `${columnName}:${mode}`;

const numberFilterOperators: { value: NumericFilterOperator; label: string }[] = [
  { value: "gt", label: "Greater Than" },
  { value: "lt", label: "Less Than" },
  { value: "eq", label: "Equal" },
  { value: "between", label: "Between" },
];

const textFilterOperators: { value: TextFilterOperator; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "startsWith", label: "Starts With" },
];

const booleanFilterOptions: { value: string; label: string }[] = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
];

const isNumberOperator = (value: string): value is NumericFilterOperator => numberFilterOperators.some((option) => option.value === value);
const isTextOperator = (value: string): value is TextFilterOperator => textFilterOperators.some((option) => option.value === value);

const getDefaultFilterOperator = (columnKind: ColumnKind): FilterOperator => {
  if (columnKind === "number") {
    return "eq";
  }
  if (columnKind === "boolean") {
    return "is";
  }
  return "contains";
};

const toNumericValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toBooleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
};

const inferColumnKind = (values: unknown[]): ColumnKind => {
  const nonEmptyValues = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (nonEmptyValues.length === 0) {
    return "text";
  }

  if (nonEmptyValues.every((value) => toBooleanValue(value) !== null)) {
    return "boolean";
  }

  if (nonEmptyValues.every((value) => toNumericValue(value) !== null)) {
    return "number";
  }

  return "text";
};

const isFilterConditionActive = (condition: ColumnFilterCondition | undefined, columnKind: ColumnKind): boolean => {
  if (!condition) {
    return false;
  }

  if (columnKind === "number") {
    if (!isNumberOperator(condition.operator)) {
      return false;
    }
    if (condition.operator === "between") {
      return toNumericValue(condition.value) !== null && toNumericValue(condition.secondValue) !== null;
    }
    return toNumericValue(condition.value) !== null;
  }

  if (columnKind === "boolean") {
    return condition.value === "true" || condition.value === "false";
  }

  if (!isTextOperator(condition.operator)) {
    return false;
  }
  return condition.value.trim().length > 0;
};

const matchesFilterCondition = (value: unknown, condition: ColumnFilterCondition | undefined, columnKind: ColumnKind): boolean => {
  if (!condition || !isFilterConditionActive(condition, columnKind)) {
    return true;
  }

  if (columnKind === "number") {
    if (!isNumberOperator(condition.operator)) {
      return true;
    }

    const numericValue = toNumericValue(value);
    if (numericValue === null) {
      return false;
    }

    if (condition.operator === "between") {
      const minValue = toNumericValue(condition.value);
      const maxValue = toNumericValue(condition.secondValue);
      if (minValue === null || maxValue === null) {
        return true;
      }
      const lowerBound = Math.min(minValue, maxValue);
      const upperBound = Math.max(minValue, maxValue);
      return numericValue >= lowerBound && numericValue <= upperBound;
    }

    const targetValue = toNumericValue(condition.value);
    if (targetValue === null) {
      return true;
    }

    if (condition.operator === "gt") {
      return numericValue > targetValue;
    }
    if (condition.operator === "lt") {
      return numericValue < targetValue;
    }
    return numericValue === targetValue;
  }

  if (columnKind === "boolean") {
    const boolValue = toBooleanValue(value);
    if (boolValue === null) {
      return false;
    }
    return (condition.value === "true" && boolValue) || (condition.value === "false" && !boolValue);
  }

  const normalizedValue = formatCellValue(value).toLowerCase();
  const normalizedTarget = condition.value.trim().toLowerCase();
  if (!normalizedTarget) {
    return true;
  }

  if (condition.operator === "equals") {
    return normalizedValue === normalizedTarget;
  }
  if (condition.operator === "startsWith") {
    return normalizedValue.startsWith(normalizedTarget);
  }
  return normalizedValue.includes(normalizedTarget);
};

export function GeoPlusBottomTableCard({
  activeTab = "none",
  onTabChange,
  onClose,
  isVisible,
  layer,
  layers = [],
  onSelectLayer,
  reserveRightPanelSpace = false,
  onZoomToFeature,
  onApplyFilter,
}: GeoPlusBottomTableCardProps) {
  const isReallyVisible = isVisible !== undefined ? isVisible : activeTab !== "none";
  const [localActiveTab, setLocalActiveTab] = useState<"table" | "shell">("table");
  const internalActiveTab = activeTab === "table" || activeTab === "shell" ? activeTab : localActiveTab;
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const chartPreviewRef = useRef<GeoPlusEchartsInsightChartHandle | null>(null);
  const popoverTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const popoverRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [isShellConfigOpen, setIsShellConfigOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnSearchQueries, setColumnSearchQueries] = useState<Record<string, string>>({});
  const [columnFilterConditions, setColumnFilterConditions] = useState<Record<string, ColumnFilterCondition>>({});
  const [activeColumnPopover, setActiveColumnPopover] = useState<ColumnPopoverState>(null);
  const [chartColumn, setChartColumn] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartPalette, setChartPalette] = useState<ChartPaletteId>("brand");
  const [chartShowValues, setChartShowValues] = useState(true);
  const [chartMaxItems, setChartMaxItems] = useState(8);
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (typeof document === "undefined") {
      return false;
    }
    return document.documentElement.classList.contains("dark");
  });

  const sourceFeatureCollection = useMemo(() => (layer ? toFeatureCollection(layer) : null), [layer]);

  const tableColumns = useMemo(() => {
    if (!sourceFeatureCollection) {
      return [] as string[];
    }

    const columnNames = new Set<string>();
    for (const feature of sourceFeatureCollection.features.slice(0, 120)) {
      const properties = asRecord(feature.properties);
      if (!properties) {
        continue;
      }
      for (const propertyName of Object.keys(properties)) {
        columnNames.add(propertyName);
      }
    }

    return [...columnNames].sort((left, right) => left.localeCompare(right));
  }, [sourceFeatureCollection]);

  const tableMinWidth = useMemo(() => `${Math.max(780, 96 + tableColumns.length * 220)}px`, [tableColumns.length]);

  const tableRows = useMemo(() => {
    if (!sourceFeatureCollection) {
      return [] as TableRow[];
    }

    return sourceFeatureCollection.features.slice(0, 200).map((feature) => {
      const properties = asRecord(feature.properties) ?? {};
      const values: Record<string, unknown> = {};

      for (const columnName of tableColumns) {
        values[columnName] = properties[columnName];
      }

      return {
        feature,
        values,
      };
    });
  }, [sourceFeatureCollection, tableColumns]);

  const columnKinds = useMemo(() => {
    const kinds: Record<string, ColumnKind> = {};
    for (const columnName of tableColumns) {
      const columnValues = tableRows.map((row) => row.values[columnName]);
      kinds[columnName] = inferColumnKind(columnValues);
    }
    return kinds;
  }, [tableColumns, tableRows]);

  const filteredRows = useMemo(() => {
    const activeSearchQueries = Object.entries(columnSearchQueries).filter(([, value]) => value.trim().length > 0);
    const activeFilterConditions = Object.entries(columnFilterConditions).filter(([columnName, condition]) =>
      isFilterConditionActive(condition, columnKinds[columnName] ?? "text"),
    );

    if (activeSearchQueries.length === 0 && activeFilterConditions.length === 0) {
      return tableRows;
    }

    return tableRows.filter((row) => {
      const matchesSearch = activeSearchQueries.every(([columnName, query]) =>
        formatCellValue(row.values[columnName]).toLowerCase().includes(query.trim().toLowerCase()),
      );
      if (!matchesSearch) {
        return false;
      }

      return activeFilterConditions.every(([columnName, condition]) =>
        matchesFilterCondition(row.values[columnName], condition, columnKinds[columnName] ?? "text"),
      );
    });
  }, [columnFilterConditions, columnKinds, columnSearchQueries, tableRows]);

  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return filteredRows;
    }

    const direction = sortDirection === "asc" ? 1 : -1;
    const rows = [...filteredRows];

    rows.sort((leftRow, rightRow) => {
      const leftValue = toComparableValue(leftRow.values[sortColumn]);
      const rightValue = toComparableValue(rightRow.values[sortColumn]);

      if (leftValue === null && rightValue === null) {
        return 0;
      }
      if (leftValue === null) {
        return 1;
      }
      if (rightValue === null) {
        return -1;
      }

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });

    return rows;
  }, [filteredRows, sortColumn, sortDirection]);

  const chartData = useMemo(() => {
    if (!chartColumn || !tableColumns.includes(chartColumn)) {
      return [] as InsightChartDatum[];
    }
    return buildChartData(filteredRows, chartColumn);
  }, [chartColumn, filteredRows, tableColumns]);
  const normalizedChartMaxItems = useMemo(() => {
    const parsedValue = Number(chartMaxItems);
    if (!Number.isFinite(parsedValue)) {
      return 8;
    }
    return Math.max(3, Math.min(20, Math.round(parsedValue)));
  }, [chartMaxItems]);
  const chartDisplayData = useMemo(() => {
    return chartData.slice(0, normalizedChartMaxItems);
  }, [chartData, normalizedChartMaxItems]);

  const activeFilterCount = useMemo(
    () =>
      Object.entries(columnFilterConditions).filter(([columnName, condition]) =>
        isFilterConditionActive(condition, columnKinds[columnName] ?? "text"),
      ).length,
    [columnFilterConditions, columnKinds],
  );
  const activeSearchCount = useMemo(
    () => Object.values(columnSearchQueries).filter((value) => value.trim().length > 0).length,
    [columnSearchQueries],
  );

  useEffect(() => {
    if (!activeColumnPopover) {
      return;
    }

    const activeKey = getColumnPopoverKey(activeColumnPopover.columnName, activeColumnPopover.mode);
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const triggerElement = popoverTriggerRefs.current[activeKey];
      const popoverElement = popoverRefs.current[activeKey];
      if (triggerElement?.contains(target) || popoverElement?.contains(target)) {
        return;
      }

      setActiveColumnPopover(null);
    };

    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, [activeColumnPopover]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const nextIsDark = root.classList.contains("dark");
      setIsDarkTheme((previousTheme) => (previousTheme === nextIsDark ? previousTheme : nextIsDark));
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const toggleSortForColumn = (columnName: string) => {
    if (sortColumn !== columnName) {
      setSortColumn(columnName);
      setSortDirection("asc");
      return;
    }

    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }

    if (sortDirection === "desc") {
      setSortColumn(null);
      setSortDirection(null);
      return;
    }

    setSortDirection("asc");
  };

  const setColumnSearchValue = (columnName: string, value: string) => {
    setColumnSearchQueries((previousSearches) => {
      const nextSearches = {
        ...previousSearches,
      };

      if (value.trim().length === 0) {
        delete nextSearches[columnName];
      } else {
        nextSearches[columnName] = value;
      }

      return nextSearches;
    });
  };

  const updateColumnFilterCondition = (columnName: string, patch: Partial<ColumnFilterCondition>) => {
    const columnKind = columnKinds[columnName] ?? "text";
    const defaultOperator = getDefaultFilterOperator(columnKind);

    setColumnFilterConditions((previousConditions) => {
      const previousCondition = previousConditions[columnName] ?? {
        operator: defaultOperator,
        value: "",
        secondValue: "",
      };

      const nextCondition = {
        ...previousCondition,
        ...patch,
      };

      return {
        ...previousConditions,
        [columnName]: nextCondition,
      };
    });
  };

  const clearColumnFilterCondition = (columnName: string) => {
    setColumnFilterConditions((previousConditions) => {
      const nextConditions = {
        ...previousConditions,
      };
      delete nextConditions[columnName];
      return nextConditions;
    });
  };

  const openColumnPopover = (columnName: string, mode: ColumnPopoverMode) => {
    if (mode === "filter") {
      const columnKind = columnKinds[columnName] ?? "text";
      const defaultOperator = getDefaultFilterOperator(columnKind);
      setColumnFilterConditions((previousConditions) => {
        if (previousConditions[columnName]) {
          return previousConditions;
        }
        return {
          ...previousConditions,
          [columnName]: {
            operator: defaultOperator,
            value: "",
            secondValue: "",
          },
        };
      });
    }

    setActiveColumnPopover((currentState) =>
      currentState?.columnName === columnName && currentState?.mode === mode
        ? null
        : {
            columnName,
            mode,
          },
    );
  };

  const downloadCurrentChart = () => {
    if (!chartColumn) {
      return;
    }

    const safeColumnName = toSafeChartFileBase(chartColumn);
    const fileName = `${safeColumnName || "chart"}-${chartType}.png`;
    chartPreviewRef.current?.downloadAsPng(fileName);
  };

  if (!isReallyVisible) {
    return null;
  }

  return (
    <aside
      className={
        isExpanded || !reserveRightPanelSpace
          ? "pointer-events-none absolute bottom-3 left-[var(--geoplus-left-safe-area,0.75rem)] right-3 z-30 hidden lg:block"
          : "pointer-events-none absolute bottom-3 left-[var(--geoplus-left-safe-area,0.75rem)] right-[350px] z-30 hidden lg:block xl:right-[390px]"
      }
    >
      <div className={`pointer-events-auto overflow-hidden rounded-2xl border border-border bg-background/95 text-foreground shadow-lg backdrop-blur-md ${isCompact ? "h-[220px]" : "h-[360px]"}`}>
          <div className={`flex items-center justify-between border-b border-border/70 bg-background/75 pl-2 pr-3 ${isCompact ? "h-10" : "h-12"}`}>
            <div className="flex h-full items-center gap-1">
              {(internalActiveTab === "table" || layer) && (
                <button
                  onClick={() => {
                    setLocalActiveTab("table");
                    onTabChange?.("table");
                  }}
                  className={`inline-flex h-full items-center gap-2 border-b-2 px-3 font-semibold transition-colors ${
                    internalActiveTab === "table"
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  } ${isCompact ? "text-xs" : "text-sm"}`}
                >
                  <Table2 className={isCompact ? "size-3.5" : "size-4"} />
                  <span>{layer?.name ?? "Attribute Table"}</span>
                </button>
              )}
              <button                onClick={() => {
                  setLocalActiveTab("shell");
                  onTabChange?.("shell");
                }}
                className={`inline-flex h-full items-center gap-2 border-b-2 px-3 font-semibold transition-colors ${
                  internalActiveTab === "shell" 
                    ? "border-accent text-accent" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                } ${isCompact ? "text-xs" : "text-sm"}`}
              >
                <Terminal className={isCompact ? "size-3.5" : "size-4"} />
                <span>Shell</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <button
                type="button"
                onClick={() => setIsCompact((prev) => !prev)}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent/15 hover:text-accent ${isCompact ? "bg-accent/15 text-accent" : ""}`}
                aria-label={isCompact ? "Restore height" : "Compact layout"}
                title={isCompact ? "Restore height" : "Compact layout"}
              >
                <Minimize2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  if (onTabChange) onTabChange("none");
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent/15 hover:text-accent"
                aria-label="Collapse panel"
              >
                <ChevronDown className="size-4" />
              </button>
              {reserveRightPanelSpace ? (
                <button
                  type="button"
                  onClick={() => setIsExpanded((previous) => !previous)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent/15 hover:text-accent"
                  aria-label={isExpanded ? "Restore panel width" : "Expand panel width"}
                >
                  <Expand className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  if (onTabChange) onTabChange("none");
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent/15 hover:text-accent"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col relative" style={{ height: isCompact ? "calc(100% - 2.5rem)" : "calc(100% - 3rem)" }}>
            {internalActiveTab === "shell" ? (
              <>
                <div className="flex h-8 items-center justify-between border-b border-border/40 bg-muted/20 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Active Layer:</span>
                    <span className="text-xs text-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">{layer?.name || "None"}</span>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setIsShellConfigOpen(!isShellConfigOpen)}
                      className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground transition hover:bg-accent/15 hover:text-accent"
                    >
                      <Settings2 className="size-3" />
                      Config
                    </button>
                    
                    {isShellConfigOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsShellConfigOpen(false)} />
                        <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-border/70 bg-card p-3 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                          <h4 className="mb-3 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
                            <Database className="size-3.5 text-accent" />
                            Shell Configuration
                          </h4>
                          
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[0.65rem] font-semibold text-foreground">Target Layer</label>
                              <select
                                value={layer?.id || ""}
                                onChange={(e) => {
                                  onSelectLayer?.(e.target.value);
                                  setIsShellConfigOpen(false);
                                }}
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/50"
                              >
                                <option value="" disabled>Select a layer...</option>
                                {layers.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="space-y-1.5">
                              <label className="text-[0.65rem] font-semibold text-foreground">SQL Alias</label>
                              <input
                                type="text"
                                readOnly
                                value={layer?.name.toLowerCase().replace(/[^a-z0-9]/g, "_") || ""}
                                className="h-8 w-full rounded-md border border-input bg-muted/50 px-2 text-xs font-mono text-muted-foreground cursor-not-allowed"
                              />
                              <p className="text-[0.6rem] text-muted-foreground leading-snug">
                                This alias will be used to refer to the layer in DuckDB queries (Coming soon).
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 w-full min-h-0 bg-background/95">
                  <DuckDbShell layer={layer} onApplyFilter={onApplyFilter} />
                </div>
              </>
            ) : (
              <>
                <div
                  ref={mainScrollRef}
                  className="geoplus-panel-scroll geoplus-horizontal-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto"
                  onScroll={() => {
                    const source = mainScrollRef.current;
                    const target = bottomHorizontalScrollRef.current;
                    if (!source || !target) {
                      return;
                    }
                    if (Math.abs(target.scrollLeft - source.scrollLeft) < 1) {
                      return;
                    }
                    target.scrollLeft = source.scrollLeft;
                  }}
                >
              {!layer ? (
                <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
                  Select a queryable layer and use the table action to preview rows here.
                </div>
              ) : tableRows.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">No table rows available for this layer.</div>
              ) : (
                <div style={{ minWidth: tableMinWidth }}>
                  <div className="flex items-center justify-between border-b border-border/70 bg-muted/45 px-3 py-2 text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                    <span>
                      Rows {sortedRows.length}/{tableRows.length}
                    </span>
                    <span className="flex items-center gap-2">
                      {sortColumn && sortDirection ? `Sort: ${formatColumnLabel(sortColumn)} ${sortDirection.toUpperCase()}` : "Sort: Off"}
                      {activeSearchCount > 0 ? `| Search: ${activeSearchCount}` : null}
                      {activeFilterCount > 0 ? `| Filters: ${activeFilterCount}` : null}
                      {chartColumn ? `| Chart: ${formatColumnLabel(chartColumn)}` : null}
                    </span>
                  </div>

                  {sortedRows.length === 0 ? (
                    <div className="flex items-center justify-center px-4 py-8 text-xs text-muted-foreground">
                      No rows match current filters.
                      <button
                        type="button"
                        onClick={() => {
                          setColumnSearchQueries({});
                          setColumnFilterConditions({});
                          setActiveColumnPopover(null);
                        }}
                        className="ml-2 rounded border border-border/70 px-2 py-1 text-[0.65rem] uppercase tracking-[0.06em] text-accent transition hover:border-accent/50 hover:text-accent"
                      >
                        Clear Filters
                      </button>
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-muted/70 text-foreground">
                        <tr>
                          <th className={`w-[96px] min-w-[96px] border-b border-r border-border/70 px-3 font-semibold uppercase tracking-[0.08em] ${isCompact ? "py-1.5 text-[0.68rem]" : "py-3 text-[0.72rem]"}`}>
                            Actions
                          </th>
                          {tableColumns.map((columnName) => {
                            const isSortingThisColumn = sortColumn === columnName && sortDirection !== null;
                            const currentSearchValue = columnSearchQueries[columnName] ?? "";
                            const columnKind = columnKinds[columnName] ?? "text";
                            const currentFilterCondition = columnFilterConditions[columnName] ?? {
                              operator: getDefaultFilterOperator(columnKind),
                              value: "",
                              secondValue: "",
                            };
                            const filterIsActive = isFilterConditionActive(currentFilterCondition, columnKind);
                            const activeModeForColumn = activeColumnPopover?.columnName === columnName ? activeColumnPopover.mode : null;
                            const isSearchPopoverOpen = activeModeForColumn === "search";
                            const isFilterPopoverOpen = activeModeForColumn === "filter";
                            const searchPopoverKey = getColumnPopoverKey(columnName, "search");
                            const filterPopoverKey = getColumnPopoverKey(columnName, "filter");
                            const activePopoverKey = activeModeForColumn ? getColumnPopoverKey(columnName, activeModeForColumn) : null;

                            return (
                              <th key={columnName} className={`relative w-[220px] min-w-[220px] border-b border-r border-border/70 px-3 align-top ${isCompact ? "py-1.5" : "py-2"}`}>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-semibold text-foreground">{formatColumnLabel(columnName)}</span>
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                      <button
                                        type="button"
                                        className="rounded p-0.5 transition hover:bg-accent/15 hover:text-accent"
                                        aria-label={`Sort ${columnName}`}
                                        onClick={() => toggleSortForColumn(columnName)}
                                      >
                                        <ArrowUpDown className="size-4" />
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded p-0.5 transition hover:bg-accent/15 hover:text-accent"
                                        aria-label={`Search ${columnName}`}
                                        ref={(element) => {
                                          popoverTriggerRefs.current[searchPopoverKey] = element;
                                        }}
                                        onClick={() => openColumnPopover(columnName, "search")}
                                      >
                                        <Search className="size-4" />
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded p-0.5 transition hover:bg-accent/15 hover:text-accent"
                                        aria-label={`Filter ${columnName}`}
                                        ref={(element) => {
                                          popoverTriggerRefs.current[filterPopoverKey] = element;
                                        }}
                                        onClick={() => openColumnPopover(columnName, "filter")}
                                      >
                                        <Filter className="size-4" />
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded p-0.5 transition hover:bg-accent/15 hover:text-accent"
                                        aria-label={`Analyze ${columnName}`}
                                        onClick={() => setChartColumn(columnName)}
                                      >
                                        <ChartNoAxesColumn className="size-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {isSortingThisColumn ? (
                                    <p className="text-[0.62rem] uppercase tracking-[0.08em] text-accent">
                                      {sortDirection === "asc" ? "Ascending" : "Descending"}
                                    </p>
                                  ) : null}

                                  {isSearchPopoverOpen || isFilterPopoverOpen ? (
                                    <div
                                      ref={(element) => {
                                        if (!activePopoverKey) {
                                          return;
                                        }
                                        popoverRefs.current[activePopoverKey] = element;
                                      }}
                                      className="absolute right-2 top-[calc(100%+0.25rem)] z-40 w-56 rounded-lg border border-border/80 bg-card p-2 shadow-[0_10px_28px_rgba(15,23,42,0.2)]"
                                    >
                                      <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {isSearchPopoverOpen ? "Search Column" : "Filter Column"}
                                      </p>
                                      {isSearchPopoverOpen ? (
                                        <div className="flex items-center gap-1 rounded border border-border/70 bg-muted/45 p-1">
                                          <input
                                            type="text"
                                            value={currentSearchValue}
                                            onChange={(event) => setColumnSearchValue(columnName, event.target.value)}
                                            placeholder="Search values"
                                            className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/70"
                                          />
                                          {currentSearchValue ? (
                                            <button
                                              type="button"
                                              onClick={() => setColumnSearchValue(columnName, "")}
                                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-accent/15 hover:text-accent"
                                              aria-label={`Clear search ${columnName}`}
                                            >
                                              <X className="size-3.5" />
                                            </button>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div className="space-y-2 rounded border border-border/70 bg-muted/45 p-2">
                                          {columnKind === "number" ? (
                                            <>
                                              <select
                                                value={isNumberOperator(currentFilterCondition.operator) ? currentFilterCondition.operator : "eq"}
                                                onChange={(event) => {
                                                  const nextOperator = event.target.value as NumericFilterOperator;
                                                  updateColumnFilterCondition(columnName, {
                                                    operator: nextOperator,
                                                    value: "",
                                                    secondValue: "",
                                                  });
                                                }}
                                                className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none focus:border-accent/70"
                                              >
                                                {numberFilterOperators.map((operator) => (
                                                  <option key={operator.value} value={operator.value}>
                                                    {operator.label}
                                                  </option>
                                                ))}
                                              </select>

                                              {isNumberOperator(currentFilterCondition.operator) && currentFilterCondition.operator === "between" ? (
                                                <div className="grid grid-cols-2 gap-1">
                                                  <input
                                                    type="number"
                                                    value={currentFilterCondition.value}
                                                    onChange={(event) => updateColumnFilterCondition(columnName, { value: event.target.value })}
                                                    placeholder="Min"
                                                    className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/70"
                                                  />
                                                  <input
                                                    type="number"
                                                    value={currentFilterCondition.secondValue ?? ""}
                                                    onChange={(event) => updateColumnFilterCondition(columnName, { secondValue: event.target.value })}
                                                    placeholder="Max"
                                                    className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/70"
                                                  />
                                                </div>
                                              ) : (
                                                <input
                                                  type="number"
                                                  value={currentFilterCondition.value}
                                                  onChange={(event) => updateColumnFilterCondition(columnName, { value: event.target.value, secondValue: "" })}
                                                  placeholder="Value"
                                                  className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/70"
                                                />
                                              )}
                                            </>
                                          ) : columnKind === "boolean" ? (
                                            <select
                                              value={currentFilterCondition.value}
                                              onChange={(event) => updateColumnFilterCondition(columnName, { operator: "is", value: event.target.value })}
                                              className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none focus:border-accent/70"
                                            >
                                              <option value="">Select value</option>
                                              {booleanFilterOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <>
                                              <select
                                                value={isTextOperator(currentFilterCondition.operator) ? currentFilterCondition.operator : "contains"}
                                                onChange={(event) => {
                                                  const nextOperator = event.target.value as TextFilterOperator;
                                                  updateColumnFilterCondition(columnName, { operator: nextOperator });
                                                }}
                                                className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none focus:border-accent/70"
                                              >
                                                {textFilterOperators.map((operator) => (
                                                  <option key={operator.value} value={operator.value}>
                                                    {operator.label}
                                                  </option>
                                                ))}
                                              </select>
                                              <input
                                                type="text"
                                                value={currentFilterCondition.value}
                                                onChange={(event) => updateColumnFilterCondition(columnName, { value: event.target.value, secondValue: "" })}
                                                placeholder="Filter value"
                                                className="h-7 w-full rounded border border-input bg-background px-2 text-[0.72rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/70"
                                              />
                                            </>
                                          )}

                                          {filterIsActive ? (
                                            <button
                                              type="button"
                                              onClick={() => clearColumnFilterCondition(columnName)}
                                              className="w-full rounded border border-border/70 px-2 py-1 text-[0.65rem] uppercase tracking-[0.06em] text-muted-foreground transition hover:border-accent/50 hover:text-accent"
                                            >
                                              Clear Filter
                                            </button>
                                          ) : null}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row, index) => {
                          const canZoom = Boolean(row.feature.geometry) && Boolean(onZoomToFeature);
                          return (
                            <tr key={`row-${index}`} className="border-b border-border/70 text-foreground/95 hover:bg-muted/40 transition-colors">
                              <td className={`w-[96px] min-w-[96px] whitespace-nowrap border-r border-border/70 px-3 ${isCompact ? "py-1" : "py-2"}`}>
                                <button
                                  type="button"
                                  className={`inline-flex items-center justify-center rounded-lg border border-border/80 bg-background/75 text-muted-foreground transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-45 ${isCompact ? "h-6 w-6" : "h-8 w-8"}`}
                                  aria-label="Zoom to feature"
                                  title="Zoom to feature"
                                  disabled={!canZoom}
                                  onClick={() => {
                                    if (!canZoom) {
                                      return;
                                    }
                                    onZoomToFeature?.(row.feature);
                                  }}
                                >
                                  <ZoomIn className={isCompact ? "size-3.5" : "size-4"} />
                                </button>
                              </td>
                              {tableColumns.map((columnName) => (
                                <td key={`${columnName}-${index}`} className={`w-[220px] min-w-[220px] max-w-[220px] truncate whitespace-nowrap border-r border-border/70 px-3 text-foreground/90 ${isCompact ? "py-1 text-xs" : "py-2 text-sm"}`}>
                                  {formatCellDisplayValue(row.values[columnName])}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {layer && tableRows.length > 0 ? (
              <div
                ref={bottomHorizontalScrollRef}
                className="geoplus-panel-scroll geoplus-horizontal-scrollbar h-5 shrink-0 overflow-x-scroll overflow-y-hidden border-t border-border/70 bg-muted/30"
                aria-label="Table horizontal scrollbar"
                onScroll={() => {
                  const source = bottomHorizontalScrollRef.current;
                  const target = mainScrollRef.current;
                  if (!source || !target) {
                    return;
                  }
                  if (Math.abs(target.scrollLeft - source.scrollLeft) < 1) {
                    return;
                  }
                  target.scrollLeft = source.scrollLeft;
                }}
              >
                <div style={{ width: tableMinWidth, height: 2 }} />
              </div>
            ) : null}
            </>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(chartColumn)}
        onOpenChange={(nextIsOpen) => {
          if (!nextIsOpen) {
            setChartColumn(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl border-border/80 bg-background">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2 text-foreground">
              <ChartNoAxesColumn className="size-4 text-accent" />
              {chartColumn ? `${formatColumnLabel(chartColumn)} Distribution` : "Column Distribution"}
            </DialogTitle>
            <DialogDescription>Value counts are computed from the currently filtered table rows. Change chart type, style, and export.</DialogDescription>
          </DialogHeader>

          {!chartColumn || chartData.length === 0 ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No chart data available for this column.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 md:grid-cols-5">
                <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Chart Type
                  <select
                    value={chartType}
                    onChange={(event) => setChartType(event.target.value as ChartType)}
                    className="h-8 rounded border border-input bg-background px-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none focus:border-accent/70"
                  >
                    {chartTypeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Palette
                  <select
                    value={chartPalette}
                    onChange={(event) => setChartPalette(event.target.value as ChartPaletteId)}
                    className="h-8 rounded border border-input bg-background px-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none focus:border-accent/70"
                  >
                    {Object.entries(chartPalettes).map(([paletteId, paletteConfig]) => (
                      <option key={paletteId} value={paletteId}>
                        {paletteConfig.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Max Items
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={normalizedChartMaxItems}
                    onChange={(event) => {
                      const parsedValue = Number(event.target.value);
                      if (!Number.isFinite(parsedValue)) {
                        return;
                      }
                      setChartMaxItems(Math.max(3, Math.min(20, Math.round(parsedValue))));
                    }}
                    className="h-8 rounded border border-input bg-background px-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none focus:border-accent/70"
                  />
                </label>

                <label className="col-span-2 flex items-center gap-2 self-end rounded border border-border/70 bg-background/70 px-2 py-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={chartShowValues}
                    onChange={(event) => setChartShowValues(event.target.checked)}
                    className="size-3.5 accent-[var(--accent)]"
                  />
                  Show Values
                </label>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/65 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  Showing top {chartDisplayData.length} of {chartData.length} categories
                </span>
                <button
                  type="button"
                  onClick={downloadCurrentChart}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/75 bg-background px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-foreground transition hover:border-accent/60 hover:text-accent"
                >
                  <Download className="size-3.5" />
                  Download PNG
                </button>
              </div>

              <div className="geoplus-panel-scroll overflow-auto rounded-lg border border-border/70 bg-background">
                <GeoPlusEchartsInsightChart
                  ref={chartPreviewRef}
                  data={chartDisplayData}
                  chartType={chartType}
                  paletteId={chartPalette}
                  showValues={chartShowValues}
                  title={`${formatColumnLabel(chartColumn)} Distribution`}
                  isDarkTheme={isDarkTheme}
                  minWidth={860}
                />
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Tip: Use search and filter popovers first, then generate charts from narrowed data.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
