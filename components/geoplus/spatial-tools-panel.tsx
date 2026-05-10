"use client";

import { useMemo, useState, useEffect } from "react";
import {
  CircleDot,
  Filter,
  Hammer,
  Info,
  Map,
  MapPin,
  Merge,
  Route,
  Scissors,
  Search,
  Sparkles,
  Terminal,
  ChevronDown,
  Minimize as MinimizeIcon,
  Wand2,
  Wrench,
  Plus,
  type LucideIcon,
} from "lucide-react";

import type {
  GeoPlusLayerItem,
  GeoPlusSpatialAnalysisOperation,
  GeoPlusSpatialBufferUnit,
} from "@/components/geoplus/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type SpatialToolsPanelProps = {
  layers: GeoPlusLayerItem[];
  selectedLayerId?: string;
  initialToolId?: string;
  onApplyFilter?: (layerId: string, whereClause: string, chartLabelColumn?: string) => Promise<void>;
  onRunSpatialAnalysis?: (args: {
    sourceLayerId: string;
    operation: GeoPlusSpatialAnalysisOperation;
    bufferDistance?: number;
    bufferUnit?: GeoPlusSpatialBufferUnit;
    clipLayerId?: string;
    tolerance?: number;
    iterations?: number;
  }) => void | Promise<void>;
  onSelectedLayerChange?: (layerId: string) => void;
  onOpenShell?: () => void;
};

const OPERATORS = [
  { value: "=", label: "Equals" },
  { value: "!=", label: "Not Equals" },
  { value: ">", label: "Greater Than" },
  { value: ">=", label: "Greater Than or Equal" },
  { value: "<", label: "Less Than" },
  { value: "<=", label: "Less Than or Equal" },
  { value: "LIKE", label: "Contains" },
  { value: "NOT LIKE", label: "Does Not Contain" },
  { value: "IS NULL", label: "Is Empty" },
  { value: "IS NOT NULL", label: "Is Not Empty" },
];

type ToolGroup = "Analysis" | "Data & Filters" | "Routing & Services" | "AI";

type ToolDef = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: ToolGroup;
};

const availableTools: ToolDef[] = [
  {
    id: "filter",
    label: "Filter Data",
    description: "Query and filter datasets based on attributes and expressions.",
    icon: Filter,
    group: "Data & Filters",
  },
  {
    id: "spatial-join",
    label: "Spatial Join",
    description: "Join attributes from one feature to another based on location.",
    icon: Merge,
    group: "Data & Filters",
  },
  {
    id: "buffer",
    label: "Buffer Analysis",
    description: "Create polygons around features at a specified distance.",
    icon: CircleDot,
    group: "Analysis",
  },
  {
    id: "clip",
    label: "Clip & Intersect",
    description: "Extract input features that overlay the clip features.",
    icon: Scissors,
    group: "Analysis",
  },
  {
    id: "simplify",
    label: "Simplify Geometry",
    description: "Reduce the number of vertices in polygon and line features.",
    icon: MinimizeIcon,
    group: "Analysis",
  },
  {
    id: "smooth",
    label: "Smooth Geometry",
    description: "Smooth polygon and line geometries using splines or Bezier curves.",
    icon: Wand2,
    group: "Analysis",
  },
  {
    id: "fix_geometry",
    label: "Fix Geometry",
    description: "Automatically repair invalid or self-intersecting geometries.",
    icon: Wrench,
    group: "Analysis",
  },
  {
    id: "heatmap",
    label: "Density / Heatmap",
    description: "Calculate density of point features across the map.",
    icon: Map,
    group: "Analysis",
  },
  {
    id: "routing",
    label: "Routing & Directions",
    description: "Find shortest paths or optimal routes between locations.",
    icon: Route,
    group: "Routing & Services",
  },
  {
    id: "geocoding",
    label: "Geocoding",
    description: "Convert addresses into geographic coordinates.",
    icon: MapPin,
    group: "Routing & Services",
  },
  {
    id: "ai",
    label: "AI Operations",
    description: "Run advanced spatial operations using AI models.",
    icon: Sparkles,
    group: "AI",
  },
];

export function SpatialToolsPanel({
  layers,
  selectedLayerId,
  initialToolId,
  onApplyFilter,
  onRunSpatialAnalysis,
  onSelectedLayerChange,
  onOpenShell,
}: SpatialToolsPanelProps) {
  const [selectedTool, setSelectedTool] = useState<ToolDef | null>(() => availableTools.find((tool) => tool.id === initialToolId) ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bufferDistance, setBufferDistance] = useState("1");
  const [bufferUnit, setBufferUnit] = useState<GeoPlusSpatialBufferUnit>("kilometers");
  const [clipLayerId, setClipLayerId] = useState("");
  const [tolerance, setTolerance] = useState("0.01");
  const [iterations, setIterations] = useState("2");

  // Filter builder state
  const [filterField, setFilterField] = useState("");
  const [filterOperator, setFilterOperator] = useState("=");
  const [filterValue, setFilterValue] = useState("");
  const [manualWhereClause, setManualWhereClause] = useState("");

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return availableTools;
    const lowerQuery = searchQuery.toLowerCase();
    return availableTools.filter(
      (tool) =>
        tool.label.toLowerCase().includes(lowerQuery) ||
        tool.description.toLowerCase().includes(lowerQuery) ||
        tool.group.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery]);

  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolDef[]> = {};
    for (const tool of filteredTools) {
      if (!groups[tool.group]) {
        groups[tool.group] = [];
      }
      groups[tool.group].push(tool);
    }
    return groups;
  }, [filteredTools]);

  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
  const selectedLayerWhereClause = selectedLayer?.duckDbWhereClause ?? "";

  useEffect(() => {
    if (selectedLayerWhereClause !== manualWhereClause) {
      setManualWhereClause(selectedLayerWhereClause);
    }
    // We only want to sync when the underlying layer data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerWhereClause]);

  const handleAddToQuery = () => {
    if (!filterField) return;

    let expression = "";
    const isNumeric = selectedLayer?.duckDbFilterFields?.find(f => f.columnName === filterField)?.kind === "number";
    
    if (filterOperator === "IS NULL" || filterOperator === "IS NOT NULL") {
      expression = `${filterField} ${filterOperator}`;
    } else if (filterOperator === "LIKE" || filterOperator === "NOT LIKE") {
      expression = `${filterField} ${filterOperator} '%${filterValue}%'`;
    } else {
      const formattedValue = isNumeric ? filterValue : `'${filterValue}'`;
      expression = `${filterField} ${filterOperator} ${formattedValue}`;
    }

    setManualWhereClause(prev => prev ? `(${prev}) AND (${expression})` : expression);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Hammer className="size-4 text-accent" />
            Spatial Tools
            <span className="group relative inline-flex">
              <button
                type="button"
                aria-label="Spatial tools info"
                className="inline-flex size-3 items-center justify-center rounded text-muted-foreground transition hover:text-foreground -translate-y-[0.28rem]"
              >
                <Info className="size-3" />
              </button>
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 w-64 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2.5 py-2 text-[0.66rem] font-medium leading-snug text-card-foreground opacity-0 shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition-opacity duration-150 group-hover:opacity-100">
                Select a tool to perform spatial operations, analysis, and geoprocessing on your map layers.
              </span>
            </span>
          </h2>

          <button
            type="button"
            onClick={() => onOpenShell?.()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 text-[0.66rem] font-semibold uppercase tracking-[0.07em] text-foreground transition hover:border-accent/50 hover:text-accent"
            title="Open SQL Shell"
            aria-label="Open SQL Shell"
          >
            <Terminal className="size-3.5" />
            SQL Shell
          </button>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input 
            placeholder="Search tools..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-background/50" 
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto geoplus-panel-scroll p-3 space-y-4">
        {Object.entries(groupedTools).length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No tools found matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          Object.entries(groupedTools).map(([groupName, tools]) => (
            <Collapsible key={groupName} defaultOpen className="space-y-2">
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex w-full items-center justify-between rounded-sm px-1 text-left">
                  <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    {groupName}
                  </h3>
                  <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 group-hover:text-foreground" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-2">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setSelectedTool(tool)}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/40 p-3 text-left transition hover:border-accent/40 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="rounded-md bg-background/80 p-2 text-accent shadow-sm ring-1 ring-border/50">
                      <tool.icon className="size-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[0.8rem] font-semibold text-foreground">{tool.label}</h4>
                      <p className="mt-0.5 text-[0.7rem] text-muted-foreground leading-snug">
                        {tool.description}
                      </p>
                    </div>
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </div>

      <Dialog open={!!selectedTool} onOpenChange={(open) => !open && setSelectedTool(null)}>
        <DialogContent className="sm:max-w-md border-border/80 bg-background/95 backdrop-blur-md shadow-[0_18px_48px_rgba(15,23,42,0.45)]">
          <DialogHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
                {selectedTool ? <selectedTool.icon className="size-5" /> : null}
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-lg text-foreground">
                  {selectedTool?.label}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedTool?.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedTool?.id === "filter" ? (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Target Layer</label>
                <select
                  value={selectedLayerId ?? ""}
                  onChange={(e) => {
                    onSelectedLayerChange?.(e.target.value);
                    setFilterField("");
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="" disabled>Select a layer to filter...</option>
                  {layers.filter(l => l.engine === "deck" || l.layerType === "geojson" || l.layerType === "scatterplot").map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {selectedLayer && (
                <div className="space-y-2.5 rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Query Builder</p>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <select
                        value={filterField}
                        onChange={(e) => setFilterField(e.target.value)}
                        className="w-full h-8 rounded border border-input bg-background px-2 text-xs outline-none focus:border-accent"
                      >
                        <option value="" disabled>Field</option>
                        {(selectedLayer.duckDbColumns ?? []).map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <select
                        value={filterOperator}
                        onChange={(e) => setFilterOperator(e.target.value)}
                        className="w-full h-8 rounded border border-input bg-background px-2 text-xs outline-none focus:border-accent"
                      >
                        {OPERATORS.map(op => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 w-full gap-1 px-1 text-[10px] font-bold"
                        onClick={handleAddToQuery}
                        disabled={!filterField || (!filterValue && filterOperator !== "IS NULL" && filterOperator !== "IS NOT NULL")}
                      >
                        <Plus className="size-3" /> Add
                      </Button>
                    </div>
                  </div>
                  
                  {filterOperator !== "IS NULL" && filterOperator !== "IS NOT NULL" && (
                    <div className="pt-0.5">
                      <Input
                        placeholder="Value..."
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        className="h-8 text-xs bg-background/80"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">SQL WHERE Clause</label>
                <Input
                  value={manualWhereClause}
                  onChange={(e) => setManualWhereClause(e.target.value)}
                  placeholder="e.g. status = 'active' AND value > 100"
                  className="font-mono text-xs bg-background/50"
                />
                <p className="text-[10px] text-muted-foreground">
                  The builder appends to this clause. You can also edit it manually.
                </p>
              </div>
              
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="outline" onClick={() => setSelectedTool(null)}>
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedLayerId && onApplyFilter) {
                      void onApplyFilter(selectedLayerId, "");
                      setSelectedTool(null);
                    }
                  }}
                  disabled={!selectedLayerId || !manualWhereClause}
                >
                  Clear Filter
                </Button>
                <Button 
                  onClick={() => {
                    if (selectedLayerId && onApplyFilter) {
                      void onApplyFilter(selectedLayerId, manualWhereClause);
                      setSelectedTool(null);
                    }
                  }}
                  disabled={!selectedLayerId}
                >
                  Apply Filter
                </Button>
              </div>
            </div>
          ) : selectedTool?.id === "buffer" ? (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Source Layer</label>
                <select
                  value={selectedLayerId ?? ""}
                  onChange={(e) => onSelectedLayerChange?.(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="" disabled>Select source layer...</option>
                  {layers.filter((l) => l.engine === "deck" || l.layerType === "geojson" || l.layerType === "scatterplot").map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Distance</label>
                  <Input
                    value={bufferDistance}
                    onChange={(e) => setBufferDistance(e.target.value)}
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="1"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Unit</label>
                  <select
                    value={bufferUnit}
                    onChange={(e) => setBufferUnit(e.target.value as GeoPlusSpatialBufferUnit)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  >
                    <option value="meters">Meters</option>
                    <option value="kilometers">Kilometers</option>
                    <option value="miles">Miles</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2 gap-2">
                <Button variant="outline" onClick={() => setSelectedTool(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const parsedDistance = Number(bufferDistance);
                    if (!selectedLayerId || !Number.isFinite(parsedDistance) || parsedDistance <= 0 || !onRunSpatialAnalysis) return;
                    void onRunSpatialAnalysis({
                      sourceLayerId: selectedLayerId,
                      operation: "buffer",
                      bufferDistance: parsedDistance,
                      bufferUnit,
                    });
                    setSelectedTool(null);
                  }}
                  disabled={!selectedLayerId || !Number.isFinite(Number(bufferDistance)) || Number(bufferDistance) <= 0}
                >
                  Run Buffer
                </Button>
              </div>
            </div>
          ) : selectedTool?.id === "clip" ? (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Source Layer</label>
                <select
                  value={selectedLayerId ?? ""}
                  onChange={(e) => onSelectedLayerChange?.(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="" disabled>Select source layer...</option>
                  {layers.filter((l) => l.engine === "deck" || l.layerType === "geojson" || l.layerType === "scatterplot").map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Clip Layer</label>
                <select
                  value={clipLayerId}
                  onChange={(e) => setClipLayerId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="" disabled>Select clip layer...</option>
                  {layers
                    .filter((l) => (l.engine === "deck" || l.layerType === "geojson" || l.layerType === "scatterplot") && l.id !== selectedLayerId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="outline" onClick={() => setSelectedTool(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedLayerId || !clipLayerId || !onRunSpatialAnalysis) return;
                    void onRunSpatialAnalysis({
                      sourceLayerId: selectedLayerId,
                      operation: "clip",
                      clipLayerId,
                    });
                    setSelectedTool(null);
                  }}
                  disabled={!selectedLayerId || !clipLayerId}
                >
                  Run Clip
                </Button>
              </div>
            </div>
          ) : selectedTool?.id === "simplify" || selectedTool?.id === "smooth" || selectedTool?.id === "fix_geometry" ? (
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Source Layer</label>
                <select
                  value={selectedLayerId ?? ""}
                  onChange={(e) => onSelectedLayerChange?.(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="" disabled>Select a layer to process...</option>
                  {layers.filter(l => l.engine === "deck" || l.layerType === "geojson" || l.layerType === "scatterplot").map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {selectedTool?.id === "simplify" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Tolerance</label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value)}
                    placeholder="0.01"
                    className="h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">Controls the simplification amount. Higher values remove more vertices.</p>
                </div>
              )}

              {selectedTool?.id === "smooth" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Iterations</label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="5"
                    value={iterations}
                    onChange={(e) => setIterations(e.target.value)}
                    placeholder="2"
                    className="h-9"
                  />
                  <p className="text-[10px] text-muted-foreground">Number of smoothing iterations for polygons (1-5).</p>
                </div>
              )}
              
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="outline" onClick={() => setSelectedTool(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    if (selectedLayerId && onRunSpatialAnalysis) {
                      void onRunSpatialAnalysis({
                        sourceLayerId: selectedLayerId,
                        operation: selectedTool.id as GeoPlusSpatialAnalysisOperation,
                        ...(selectedTool.id === "simplify" && { tolerance: Number(tolerance) }),
                        ...(selectedTool.id === "smooth" && { iterations: Number(iterations) }),
                      });
                      setSelectedTool(null);
                    }
                  }}
                  disabled={!selectedLayerId || (selectedTool.id === "simplify" && (!Number.isFinite(Number(tolerance)) || Number(tolerance) < 0)) || (selectedTool.id === "smooth" && (!Number.isFinite(Number(iterations)) || Number(iterations) < 1))}
                >
                  Run {selectedTool.id === "simplify" ? "Simplify" : selectedTool.id === "smooth" ? "Smooth" : "Fix Geometry"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-4">
              <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                Use this tool via SQL workflows and advanced map interactions.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedTool(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    onOpenShell?.();
                    setSelectedTool(null);
                  }}
                >
                  Open SQL Shell
                </Button>
              </div>
            </div>
          )}

        </DialogContent>
      </Dialog>
    </div>
  );
}
