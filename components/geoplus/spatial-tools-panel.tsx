"use client";

import { useMemo, useState } from "react";
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

type SpatialToolsPanelProps = {
  layers: GeoPlusLayerItem[];
  selectedLayerId?: string;
  onApplyFilter: (layerId: string, whereClause: string, chartLabelColumn?: string) => Promise<void> | void;
  onRunSpatialAnalysis: (args: {
    sourceLayerId: string;
    operation: GeoPlusSpatialAnalysisOperation;
    bufferDistance?: number;
    bufferUnit?: GeoPlusSpatialBufferUnit;
    clipLayerId?: string;
  }) => Promise<void> | void;
  onSelectedLayerChange?: (layerId: string | null) => void;
  onOpenShell?: () => void;
};

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
    id: "shell",
    label: "SQL Shell",
    description: "Advanced analysis using an interactive DuckDB SQL shell.",
    icon: Terminal,
    group: "Analysis",
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
  onApplyFilter,
  onRunSpatialAnalysis,
  onSelectedLayerChange,
  onOpenShell,
}: SpatialToolsPanelProps) {
  const [selectedTool, setSelectedTool] = useState<ToolDef | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Suppress unused warnings since we are maintaining the interface
  void layers;
  void selectedLayerId;
  void onApplyFilter;
  void onRunSpatialAnalysis;
  void onSelectedLayerChange;

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

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {Object.entries(groupedTools).length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No tools found matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          Object.entries(groupedTools).map(([groupName, tools]) => (
            <div key={groupName} className="space-y-2">
              <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground px-1">
                {groupName}
              </h3>
              <div className="grid gap-2">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => {
                      if (tool.id === "shell") {
                        onOpenShell?.();
                      } else {
                        setSelectedTool(tool);
                      }
                    }}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/40 p-3 text-left transition hover:border-accent/40 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="rounded-md bg-background/80 p-2 text-accent shadow-sm ring-1 ring-border/50 dark:bg-slate-800">
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
              </div>
            </div>
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
                  onChange={(e) => onSelectedLayerChange?.(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="" disabled>Select a layer to filter...</option>
                  {layers.filter(l => l.engine === "deck" || l.layerType === "geojson" || l.layerType === "scatterplot").map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">SQL WHERE Clause</label>
                <Input
                  id="filter-where"
                  defaultValue={layers.find(l => l.id === selectedLayerId)?.duckDbWhereClause ?? ""}
                  placeholder="e.g. status = 'active' AND value > 100"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Use standard SQL syntax to filter features by attribute values.
                </p>
              </div>
              
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="outline" onClick={() => setSelectedTool(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    const clause = (document.getElementById("filter-where") as HTMLInputElement)?.value || "";
                    if (selectedLayerId) {
                      void onApplyFilter(selectedLayerId, clause);
                      setSelectedTool(null);
                    }
                  }}
                  disabled={!selectedLayerId}
                >
                  Apply Filter
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Hammer className="size-8 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Coming Soon</h3>
                <p className="mt-2 text-sm text-muted-foreground px-6">
                  We are currently building this tool. It will be available in an upcoming update to GeoPlus.
                </p>
              </div>
            </div>
          )}

          {selectedTool?.id !== "filter" && (
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button onClick={() => setSelectedTool(null)} className="w-full sm:w-auto">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
