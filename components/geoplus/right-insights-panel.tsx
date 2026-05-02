"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, GripHorizontal, X } from "lucide-react";

import { GeoPlusAiInsights } from "@/components/geoplus/ai/ai-insights";
import { GeoPlusEchartsInsightChart, type GeoPlusEchartsInsightChartHandle } from "@/components/geoplus/echarts-insight-chart";
import {
  chartPalettes,
  chartTypeOptions,
  toSafeChartFileBase,
  type ChartPaletteId,
  type ChartType,
  type InsightChartDatum,
} from "@/components/geoplus/insight-chart-config";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { Button } from "@/components/ui/button";
import { isGeoJsonFeatureCollection } from "@/lib/geoplus/duckdb-spatial-analytics";

type GeoPlusRightInsightsPanelProps = {
  isVisible: boolean;
  layer: GeoPlusLayerItem | null;
  isTablePanelVisible?: boolean;
  onClose?: () => void;
  onChangeChartColumn?: (layerId: string, chartColumn: string) => void;
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

export function GeoPlusRightInsightsPanel({ isVisible, layer, isTablePanelVisible, onClose, onChangeChartColumn }: GeoPlusRightInsightsPanelProps) {
  const sourceFeatureCollection = useMemo(() => (layer ? toFeatureCollection(layer) : null), [layer]);
  const chartData = useMemo<InsightChartDatum[]>(
    () =>
      (layer?.duckDbChartData ?? [])
        .map((item) => ({
          label: capitalizeWords(item.label),
          value: item.value,
        }))
        .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label)),
    [layer?.duckDbChartData],
  );
  const chartPreviewRef = useRef<GeoPlusEchartsInsightChartHandle | null>(null);

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

  // Draggable State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });

  // Resizable State
  const [size, setSize] = useState({ width: 440, height: 620 });
  const [resizeMode, setResizeMode] = useState<"left" | "right" | "top" | "bottom" | null>(null);
  const sizeStartRef = useRef({ w: 0, h: 0, mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const normalizedChartMaxItems = useMemo(() => {
    const parsedValue = Number(chartMaxItems);
    if (!Number.isFinite(parsedValue)) {
      return 8;
    }
    return Math.max(3, Math.min(20, Math.round(parsedValue)));
  }, [chartMaxItems]);

  const chartDisplayData = useMemo(() => chartData.slice(0, normalizedChartMaxItems), [chartData, normalizedChartMaxItems]);

  // Set initial position on mount/visibility
  useEffect(() => {
    if (isVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition({
        x: -60,
        y: 12,
      });
    }
  }, [isVisible]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
  };

  const handleResizeStart = (e: React.MouseEvent, mode: "left" | "right" | "top" | "bottom") => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    setResizeMode(mode);
    sizeStartRef.current = {
      w: size.width,
      h: size.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) {
        return;
      }
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: positionStartRef.current.x + dx,
        y: positionStartRef.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeMode) {
        return;
      }
      const { w, h, mouseX, mouseY, posX, posY } = sizeStartRef.current;

      const maxAllowedHeight = typeof window !== "undefined" ? window.innerHeight - (isTablePanelVisible ? 390 : 24) : 1200;

      if (resizeMode === "left") {
        const dx = e.clientX - mouseX;
        const newWidth = Math.max(320, Math.min(900, w - dx));
        setSize((previousSize) => ({ ...previousSize, width: newWidth }));
      } else if (resizeMode === "right") {
        const dx = e.clientX - mouseX;
        const newWidth = Math.max(320, Math.min(900, w + dx));
        setSize((previousSize) => ({ ...previousSize, width: newWidth }));
        setPosition((previousPosition) => ({ ...previousPosition, x: posX + (newWidth - w) }));
      } else if (resizeMode === "bottom") {
        const dy = e.clientY - mouseY;
        const newHeight = Math.max(260, Math.min(maxAllowedHeight, h + dy));
        setSize((previousSize) => ({ ...previousSize, height: newHeight }));
      } else if (resizeMode === "top") {
        const dy = e.clientY - mouseY;
        const newHeight = Math.max(260, Math.min(maxAllowedHeight, h - dy));
        setSize((previousSize) => ({ ...previousSize, height: newHeight }));
        setPosition((previousPosition) => ({ ...previousPosition, y: posY + (h - newHeight) }));
      }
    };

    const handleMouseUp = () => {
      setResizeMode(null);
    };

    if (resizeMode) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizeMode, isTablePanelVisible]);

  const downloadCurrentChart = () => {
    if (!layer) {
      return;
    }
    const safeName = toSafeChartFileBase(layer.name);
    const fileName = `${safeName || "layer"}-${chartType}.png`;
    chartPreviewRef.current?.downloadAsPng(fileName);
  };

  if (!isVisible) {
    return null;
  }

  const maxHeight = isTablePanelVisible ? "calc(100vh - 390px)" : "calc(100vh - 24px)";

  return (
    <aside
      className="absolute z-40 hidden lg:block"
      style={{
        right: `${-position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div
        className="pointer-events-auto relative flex flex-col overflow-hidden rounded-2xl border border-slate-600/65 bg-slate-900/90 text-slate-100 shadow-[0_18px_48px_rgba(15,23,42,0.45)] ring-1 ring-black/40 backdrop-blur-md"
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          minWidth: "320px",
          minHeight: "260px",
          maxWidth: "900px",
          maxHeight,
        }}
      >
        <div
          className="absolute left-0 right-0 top-0 z-50 flex h-3 cursor-ns-resize items-center justify-center group"
          onMouseDown={(e) => handleResizeStart(e, "top")}
        >
          <div className="h-1 w-8 rounded-full bg-slate-500/30 transition-colors group-hover:bg-emerald-400/60" />
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 z-50 flex h-3 cursor-ns-resize items-center justify-center group"
          onMouseDown={(e) => handleResizeStart(e, "bottom")}
        >
          <div className="h-1 w-8 rounded-full bg-slate-500/30 transition-colors group-hover:bg-emerald-400/60" />
        </div>
        <div
          className="absolute bottom-0 left-0 top-0 z-50 flex w-3 cursor-ew-resize items-center justify-center group"
          onMouseDown={(e) => handleResizeStart(e, "left")}
        >
          <div className="h-8 w-1 rounded-full bg-slate-500/30 transition-colors group-hover:bg-emerald-400/60" />
        </div>
        <div
          className="absolute bottom-0 right-0 top-0 z-50 flex w-3 cursor-ew-resize items-center justify-center group"
          onMouseDown={(e) => handleResizeStart(e, "right")}
        >
          <div className="h-8 w-1 rounded-full bg-slate-500/30 transition-colors group-hover:bg-emerald-400/60" />
        </div>

        <div className="mt-2 flex cursor-move items-center justify-between border-b border-slate-700/80 px-4 py-2" onMouseDown={handleMouseDown}>
          <div className="flex items-center gap-2">
            <GripHorizontal className="size-4 text-slate-400" />
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-300">Insights</p>
              <p className="w-56 truncate text-xs text-slate-100">{layer?.name ?? "No Dataset Selected"}</p>
            </div>
          </div>
          {onClose ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="cursor-pointer rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        {!layer ? (
          <div className="flex flex-1 items-center justify-center px-5 text-sm text-slate-300">
            Open the Tools tab and select a queryable layer to view chart insights here.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700/70 px-4 py-2">
              <p className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-300">
                <BarChart3 className="size-3.5" />
                Chart
              </p>
              <span className="text-[0.68rem] text-slate-400">{chartData.length} groups</span>
            </div>

            <div className="geoplus-panel-scroll flex-1 overflow-y-auto overflow-x-auto px-4 py-3 min-h-0">
              {chartData.length === 0 ? (
                <p className="text-xs text-slate-400">
                  {sourceFeatureCollection ? "Apply filters from the Tools sidebar to generate chart groups." : "This layer does not contain queryable chart data."}
                </p>
              ) : (
                <div className="space-y-3 min-w-[280px]">
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700/70 bg-slate-900/55 p-3 md:grid-cols-6">
                    <label className="col-span-2 flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-300">
                      Chart Dimension
                      <select
                        value={layer?.duckDbChartLabelColumn ?? ""}
                        onChange={(event) => {
                          if (layer && onChangeChartColumn) {
                            onChangeChartColumn(layer.id, event.target.value);
                          }
                        }}
                        className="h-8 rounded border border-slate-600 bg-slate-950/85 px-2 text-sm font-medium normal-case tracking-normal text-slate-100 outline-none focus:border-emerald-400/70"
                      >
                        {(layer?.duckDbChartColumns ?? []).map((col) => (
                          <option key={col.columnName} value={col.columnName}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-300">
                      Chart Type
                      <select
                        value={chartType}
                        onChange={(event) => setChartType(event.target.value as ChartType)}
                        className="h-8 rounded border border-slate-600 bg-slate-950/85 px-2 text-sm font-medium normal-case tracking-normal text-slate-100 outline-none focus:border-emerald-400/70"
                      >
                        {chartTypeOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-300">
                      Palette
                      <select
                        value={chartPalette}
                        onChange={(event) => setChartPalette(event.target.value as ChartPaletteId)}
                        className="h-8 rounded border border-slate-600 bg-slate-950/85 px-2 text-sm font-medium normal-case tracking-normal text-slate-100 outline-none focus:border-emerald-400/70"
                      >
                        {Object.entries(chartPalettes).map(([paletteId, paletteConfig]) => (
                          <option key={paletteId} value={paletteId}>
                            {paletteConfig.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-300">
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
                        className="h-8 rounded border border-slate-600 bg-slate-950/85 px-2 text-sm font-medium normal-case tracking-normal text-slate-100 outline-none focus:border-emerald-400/70"
                      />
                    </label>

                    <label className="col-span-2 flex items-center gap-2 self-end rounded border border-slate-700/70 bg-slate-950/65 px-2 py-1.5 text-sm text-slate-100">
                      <input
                        type="checkbox"
                        checked={chartShowValues}
                        onChange={(event) => setChartShowValues(event.target.checked)}
                        className="size-3.5 accent-[var(--accent)]"
                      />
                      Show Values
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-sm">
                    <span className="text-slate-300">
                      Showing top {chartDisplayData.length} of {chartData.length} categories
                    </span>
                    <button
                      type="button"
                      onClick={downloadCurrentChart}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-950/75 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-100 transition hover:border-emerald-400/70 hover:text-emerald-200"
                    >
                      <Download className="size-3.5" />
                      Download PNG
                    </button>
                  </div>

                  <div className="geoplus-panel-scroll overflow-auto rounded-lg border border-slate-700/70 bg-slate-950/65">
                    <GeoPlusEchartsInsightChart
                      ref={chartPreviewRef}
                      data={chartDisplayData}
                      chartType={chartType}
                      paletteId={chartPalette}
                      showValues={chartShowValues}
                      title={`${layer.name} Insights`}
                      isDarkTheme={isDarkTheme}
                      minWidth={860}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 min-w-[280px] rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <GeoPlusAiInsights layer={layer} />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
