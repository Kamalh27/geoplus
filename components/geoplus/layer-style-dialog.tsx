"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLayerGeometryFamilies } from "@/lib/geoplus/layer-helpers";
import { COLOR_RAMPS } from "@/lib/geoplus/layer-helpers";
import type {
  GeoPlusLayerItem,
  GeoPlusLayerStyleConfig,
  GeoPlusLayerStylePreset,
  GeoPlusMarkerStyle,
  GeoPlusMarkerSymbol,
  GeoPlusColorRamp,
  GeoPlusClassificationMethod,
} from "@/components/geoplus/types";

// Extracted Constants from layer-panel to avoid circular dependencies
type StylePresetOption = {
  id: GeoPlusLayerStylePreset;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type MarkerStyleOption = {
  id: GeoPlusMarkerStyle;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type MarkerSymbolOption = {
  id: GeoPlusMarkerSymbol;
  label: string;
  glyph: string;
};

type ColorRampOption = {
  id: GeoPlusColorRamp;
  label: string;
};

type LayerStyleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  layer: GeoPlusLayerItem;
  stylePresetOptions: StylePresetOption[];
  markerStyleOptions: MarkerStyleOption[];
  markerSymbolOptions: MarkerSymbolOption[];
  colorRampOptions: ColorRampOption[];
  styleTargetDefaults: { fill: string; line: string; point: string; label: string };
  defaultStyleConfig: {
    fillOpacity: number;
    lineWidth: number;
    pointRadius: number;
    labelSize: number;
  };
  onSetLayerStylePreset: (layerId: string, preset: GeoPlusLayerStylePreset) => void;
  onSetLayerStyleConfig: (layerId: string, config: Partial<GeoPlusLayerStyleConfig>) => void;
  handleCustomMarkerUpload: (layerId: string, file: File | null) => void;
  getLayerStyleFieldOptions: (layer: GeoPlusLayerItem) => string[];
  clampValue: (value: number, min: number, max: number) => number;
  getLayerDisplayName: (name: string) => string;
};

export function LayerStyleDialog({
  isOpen,
  onClose,
  layer,
  stylePresetOptions,
  markerStyleOptions,
  markerSymbolOptions,
  colorRampOptions,
  styleTargetDefaults,
  defaultStyleConfig,
  onSetLayerStylePreset,
  onSetLayerStyleConfig,
  handleCustomMarkerUpload,
  getLayerStyleFieldOptions,
  clampValue,
  getLayerDisplayName,
}: LayerStyleDialogProps) {
  const [showColorRampDropdown, setShowColorRampDropdown] = useState(false);
  const styleTargetGeometryFamilies = getLayerGeometryFamilies(layer);
  const isRaster = layer.layerType === "raster-tile" || layer.layerType === "wms";
  const hasPoints = styleTargetGeometryFamilies.includes("Point") || (!isRaster && styleTargetGeometryFamilies.length === 0);
  const hasLines = styleTargetGeometryFamilies.includes("Line") || (!isRaster && styleTargetGeometryFamilies.length === 0);
  const hasPolygons = styleTargetGeometryFamilies.includes("Polygon") || (!isRaster && styleTargetGeometryFamilies.length === 0);

  const isClassified = Boolean(layer.styleConfig?.colorByField);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-border/80 bg-background">
        <div className="space-y-4">
          <DialogHeader>
            <DialogTitle>Layer Style</DialogTitle>
            <DialogDescription>
              Configure colors and drawing settings for <span className="font-semibold text-foreground">{getLayerDisplayName(layer.name)}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 rounded-lg border border-border/50 bg-muted/10 p-3">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Style By Attribute</p>
            <select
              value={layer.styleConfig?.colorByField ?? ""}
              onChange={(event) =>
                onSetLayerStyleConfig(layer.id, {
                  colorByField: event.target.value.trim() || undefined,
                })
              }
              className="h-9 w-full rounded border border-border/80 bg-background px-2 text-sm text-foreground"
            >
              <option value="">None (single color)</option>
              {getLayerStyleFieldOptions(layer).map((fieldName) => (
                <option key={fieldName} value={fieldName}>
                  {fieldName}
                </option>
              ))}
            </select>
            
            {isClassified && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="space-y-1 relative">
                  <label className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Color Ramp</label>
                  <button
                    type="button"
                    onClick={() => setShowColorRampDropdown(!showColorRampDropdown)}
                    className="h-8 w-full flex items-center justify-between rounded border border-border/80 bg-background px-2 text-xs text-foreground"
                  >
                    <span className="truncate pr-2">
                      {layer.styleConfig?.colorRamp === "custom" ? "Custom" : colorRampOptions.find(r => r.id === (layer.styleConfig?.colorRamp ?? "vivid"))?.label ?? "Vivid"}
                    </span>
                    <div className="flex h-3 w-16 overflow-hidden rounded-sm">
                      {(layer.styleConfig?.colorRamp === "custom" && layer.styleConfig.customColorRamp 
                        ? layer.styleConfig.customColorRamp 
                        : COLOR_RAMPS[(layer.styleConfig?.colorRamp && layer.styleConfig.colorRamp !== "custom" ? layer.styleConfig.colorRamp : "vivid") as keyof typeof COLOR_RAMPS]
                      ).map((c, i) => (
                        <div key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </button>

                  {showColorRampDropdown && (
                    <div className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border/80 bg-popover shadow-md">
                      <div className="p-1">
                        {colorRampOptions.map((option) => {
                          const colors = option.id === "custom" 
                            ? (layer.styleConfig?.customColorRamp ?? ["#000000", "#ffffff"])
                            : COLOR_RAMPS[option.id as keyof typeof COLOR_RAMPS];
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                onSetLayerStyleConfig(layer.id, { colorRamp: option.id });
                                setShowColorRampDropdown(false);
                              }}
                              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                            >
                              <span>{option.label}</span>
                              <div className="flex h-3 w-16 overflow-hidden rounded-sm ring-1 ring-black/10 dark:ring-white/15">
                                {colors.map((c, i) => (
                                  <div key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="space-y-1">
                  <label className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Classification</label>
                  <select
                    value={layer.styleConfig?.classificationMethod ?? "categorical"}
                    onChange={(event) =>
                      onSetLayerStyleConfig(layer.id, {
                        classificationMethod: event.target.value as GeoPlusClassificationMethod,
                      })
                    }
                    className="h-8 w-full rounded border border-border/80 bg-background px-2 text-xs text-foreground"
                  >
                    <option value="categorical">Categorical (Unique)</option>
                    <option value="equal-interval">Equal Interval</option>
                    <option value="quantile">Quantile</option>
                  </select>
                </div>

                {layer.styleConfig?.colorRamp === "custom" && (
                  <div className="col-span-2 space-y-1.5 mt-1 border-t border-border/50 pt-2">
                    <label className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Custom Ramp Colors (Hex)</label>
                    <input
                      type="text"
                      placeholder="#ff0000, #00ff00, #0000ff"
                      value={(layer.styleConfig?.customColorRamp ?? []).join(", ")}
                      onChange={(event) => {
                        const colors = event.target.value.split(",").map(c => c.trim()).filter(c => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/i.test(c));
                        onSetLayerStyleConfig(layer.id, {
                          customColorRamp: colors.length > 0 ? colors : undefined,
                        });
                      }}
                      className="h-8 w-full rounded border border-border/80 bg-background px-2 text-xs text-foreground"
                    />
                  </div>
                )}
                
                {(layer.styleConfig?.classificationMethod === "equal-interval" || layer.styleConfig?.classificationMethod === "quantile") && (
                  <div className="col-span-2 space-y-1.5 mt-1 border-t border-border/50 pt-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Number of Classes</label>
                      <span className="text-xs font-semibold text-foreground">{layer.styleConfig?.classificationClasses ?? 5}</span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={9}
                      step={1}
                      value={layer.styleConfig?.classificationClasses ?? 5}
                      onChange={(event) =>
                        onSetLayerStyleConfig(layer.id, {
                          classificationClasses: Number.parseInt(event.target.value, 10),
                        })
                      }
                      className="h-1.5 w-full accent-accent"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {!isClassified && (
            <div className="space-y-2">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Style Preset</p>
              <div className="grid grid-cols-5 gap-1.5">
                {stylePresetOptions.map((preset) => {
                  const isActivePreset = layer.stylePreset === preset.id;
                  const PresetIcon = preset.icon;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSetLayerStylePreset(layer.id, preset.id)}
                      className={cn(
                        "inline-flex h-8 items-center justify-center gap-1 rounded-md border px-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] transition",
                        isActivePreset
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border/80 text-muted-foreground hover:border-accent/50 hover:text-foreground",
                      )}
                    >
                      <PresetIcon className="size-3.5" />
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasPoints && (
            <>
              <div className="space-y-2">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Marker Style</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {markerStyleOptions.map((option) => {
                    const MarkerIcon = option.icon;
                    const isActiveOption = (layer.styleConfig?.markerStyle ?? "solid") === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          onSetLayerStyleConfig(layer.id, {
                            markerStyle: option.id,
                          })
                        }
                        className={cn(
                          "inline-flex h-8 items-center justify-center gap-1 rounded-md border px-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] transition",
                          isActiveOption
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border/80 text-muted-foreground hover:border-accent/50 hover:text-foreground",
                        )}
                      >
                        <MarkerIcon className="size-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(layer.styleConfig?.markerStyle ?? "solid") === "image" && (
                <div className="space-y-1.5">
                  <label className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Custom Marker Image</label>
                  <div className="rounded-md border border-border/80 bg-muted/25 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          handleCustomMarkerUpload(layer.id, event.target.files?.[0] ?? null);
                          event.currentTarget.value = "";
                        }}
                        className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded file:border file:border-border/80 file:bg-background file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground hover:file:border-accent/60"
                      />
                      {layer.styleConfig?.customMarkerDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onSetLayerStyleConfig(layer.id, {
                              customMarkerDataUrl: undefined,
                              markerStyle: "solid",
                            })
                          }
                          className="rounded border border-border/80 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {layer.styleConfig?.customMarkerDataUrl && (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1.5">
                        <Image src={layer.styleConfig.customMarkerDataUrl} alt="Custom marker preview" width={28} height={28} className="object-contain" />
                        <span className="text-[0.65rem] text-muted-foreground">Marker image ready</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(layer.styleConfig?.markerStyle ?? "solid") === "symbol" && (
                <div className="space-y-1.5">
                  <label className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Marker Symbol</label>
                  <select
                    value={layer.styleConfig?.markerSymbol ?? "dot"}
                    onChange={(event) =>
                      onSetLayerStyleConfig(layer.id, {
                        markerSymbol: event.target.value as GeoPlusMarkerSymbol,
                      })
                    }
                    className="h-9 w-full rounded border border-border/80 bg-background px-2 text-sm text-foreground"
                  >
                    {markerSymbolOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.glyph} {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          {!isClassified && (
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
              <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Colors</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {hasPolygons && (
                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Fill Color</span>
                    <input
                      type="color"
                      value={layer.styleConfig?.fillColor ?? styleTargetDefaults.fill}
                      onChange={(event) =>
                        onSetLayerStyleConfig(layer.id, {
                          fillColor: event.target.value,
                          colorByField: undefined,
                        })
                      }
                      className="h-8 w-full cursor-pointer rounded border border-border/80 bg-background"
                    />
                  </label>
                )}
                {(hasLines || hasPolygons) && (
                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {hasPolygons && !hasLines ? "Outline Color" : "Line Color"}
                    </span>
                    <input
                      type="color"
                      value={layer.styleConfig?.lineColor ?? styleTargetDefaults.line}
                      onChange={(event) =>
                        onSetLayerStyleConfig(layer.id, {
                          lineColor: event.target.value,
                          colorByField: undefined,
                        })
                      }
                      className="h-8 w-full cursor-pointer rounded border border-border/80 bg-background"
                    />
                  </label>
                )}
                {hasPoints && (
                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Marker Color</span>
                    <input
                      type="color"
                      value={layer.styleConfig?.pointColor ?? styleTargetDefaults.point}
                      onChange={(event) =>
                        onSetLayerStyleConfig(layer.id, {
                          pointColor: event.target.value,
                          colorByField: undefined,
                        })
                      }
                      className="h-8 w-full cursor-pointer rounded border border-border/80 bg-background"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1.5 cursor-pointer">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Label Color</span>
                  <input
                    type="color"
                    value={layer.styleConfig?.labelColor ?? styleTargetDefaults.label}
                    onChange={(event) =>
                      onSetLayerStyleConfig(layer.id, {
                        labelColor: event.target.value,
                      })
                    }
                    className="h-8 w-full cursor-pointer rounded border border-border/80 bg-background"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Property</th>
                  <th className="px-4 py-2.5 font-semibold">Scale</th>
                  <th className="px-4 py-2.5 font-semibold text-right w-24">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {hasPolygons && (
                  <tr className="transition-colors hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">Fill Opacity</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((layer.styleConfig?.fillOpacity ?? defaultStyleConfig.fillOpacity) * 100)}
                        onChange={(event) =>
                          onSetLayerStyleConfig(layer.id, {
                            fillOpacity: Number(event.target.value) / 100,
                          })
                        }
                        className="h-1.5 w-full accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-block w-14 rounded border border-border/50 bg-muted/20 px-2 py-1 text-xs text-foreground text-center">
                        {Math.round((layer.styleConfig?.fillOpacity ?? defaultStyleConfig.fillOpacity) * 100)}%
                      </span>
                    </td>
                  </tr>
                )}

                {(hasLines || hasPolygons) && (
                  <tr className="transition-colors hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">{hasPolygons && !hasLines ? "Outline Width" : "Line Width"}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="range"
                        min={1}
                        max={12}
                        step={0.5}
                        value={layer.styleConfig?.lineWidth ?? defaultStyleConfig.lineWidth}
                        onChange={(event) =>
                          onSetLayerStyleConfig(layer.id, {
                            lineWidth: clampValue(Number(event.target.value), 1, 12),
                          })
                        }
                        className="h-1.5 w-full accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min={1}
                        max={12}
                        step={0.5}
                        value={layer.styleConfig?.lineWidth ?? defaultStyleConfig.lineWidth}
                        onChange={(event) => {
                          const nextValue = Number.parseFloat(event.target.value);
                          if (!Number.isFinite(nextValue)) {
                            return;
                          }
                          onSetLayerStyleConfig(layer.id, {
                            lineWidth: clampValue(nextValue, 1, 12),
                          });
                        }}
                        className="w-14 rounded border border-border/80 bg-background px-2 py-1 text-xs text-foreground text-center"
                      />
                    </td>
                  </tr>
                )}

                {hasPoints && (
                  <tr className="transition-colors hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">Marker Radius</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="range"
                        min={2}
                        max={24}
                        step={1}
                        value={layer.styleConfig?.pointRadius ?? defaultStyleConfig.pointRadius}
                        onChange={(event) =>
                          onSetLayerStyleConfig(layer.id, {
                            pointRadius: Math.round(clampValue(Number(event.target.value), 2, 24)),
                          })
                        }
                        className="h-1.5 w-full accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min={2}
                        max={24}
                        step={1}
                        value={Math.round(layer.styleConfig?.pointRadius ?? defaultStyleConfig.pointRadius)}
                        onChange={(event) => {
                          const nextValue = Number.parseInt(event.target.value, 10);
                          if (!Number.isFinite(nextValue)) {
                            return;
                          }
                          onSetLayerStyleConfig(layer.id, {
                            pointRadius: Math.round(clampValue(nextValue, 2, 24)),
                          });
                        }}
                        className="w-14 rounded border border-border/80 bg-background px-2 py-1 text-xs text-foreground text-center"
                      />
                    </td>
                  </tr>
                )}

                <tr className="transition-colors hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground">Label Size</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="range"
                      min={9}
                      max={28}
                      step={1}
                      value={layer.styleConfig?.labelSize ?? defaultStyleConfig.labelSize}
                      onChange={(event) =>
                        onSetLayerStyleConfig(layer.id, {
                          labelSize: Math.round(clampValue(Number(event.target.value), 9, 28)),
                        })
                      }
                      className="h-1.5 w-full accent-accent"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min={9}
                      max={28}
                      step={1}
                      value={Math.round(layer.styleConfig?.labelSize ?? defaultStyleConfig.labelSize)}
                      onChange={(event) => {
                        const nextValue = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(nextValue)) {
                          return;
                        }
                        onSetLayerStyleConfig(layer.id, {
                          labelSize: Math.round(clampValue(nextValue, 9, 28)),
                        });
                      }}
                      className="w-14 rounded border border-border/80 bg-background px-2 py-1 text-xs text-foreground text-center"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onSetLayerStyleConfig(layer.id, {
                  fillColor: styleTargetDefaults.fill,
                  lineColor: styleTargetDefaults.line,
                  pointColor: styleTargetDefaults.point,
                  labelColor: styleTargetDefaults.label,
                  fillOpacity: defaultStyleConfig.fillOpacity,
                  lineWidth: defaultStyleConfig.lineWidth,
                  pointRadius: defaultStyleConfig.pointRadius,
                  labelSize: defaultStyleConfig.labelSize,
                  markerStyle: "solid",
                  markerSymbol: "dot",
                  customMarkerDataUrl: undefined,
                  colorByField: undefined,
                  colorRamp: "vivid",
                });
              }}
            >
              Reset Defaults
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
