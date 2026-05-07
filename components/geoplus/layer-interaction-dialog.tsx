"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SquareSwitch } from "@/components/ui/square-switch";
import type { GeoPlusLayerItem } from "./types";
import { getLayerGeometryFamilies, getLayerLabelFieldOptions } from "@/lib/geoplus/layer-helpers";
import { Type, MessageSquare, MousePointerClick, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LayerInteractionDialogProps = {
  layer: GeoPlusLayerItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdateLabelConfig: (layerId: string, config: { enabled?: boolean; field?: string }) => void;
  onUpdateInteractionConfig: (
    layerId: string,
    config: {
      tooltipEnabled?: boolean;
      popupEnabled?: boolean;
      tooltipFields?: string[];
      popupFields?: string[];
      fieldDisplayNames?: Record<string, string>;
      hoverHighlightEnabled?: boolean;
      hoverHighlightColor?: string;
      hoverLineColor?: string;
      hoverFillOpacity?: number;
      hoverLineWidth?: number;
      hoverPointRadius?: number;
    },
  ) => void;
  onUpdateStyleConfig: (layerId: string, styleConfig: Partial<GeoPlusLayerItem["styleConfig"]>) => void;
};

type LayerInteractionDraft = {
  labelEnabled: boolean;
  labelField: string;
  labelColor: string;
  labelSize: number;
  tooltipEnabled: boolean;
  tooltipFields: string[];
  popupEnabled: boolean;
  popupFields: string[];
  fieldDisplayNames: Record<string, string>;
  hoverHighlightEnabled: boolean;
  hoverHighlightColor: string;
  hoverLineColor: string;
  hoverFillOpacity: number;
  hoverLineWidth: number;
  hoverPointRadius: number;
};

const normalizeFieldDisplayNames = (value: Record<string, string> | undefined) =>
  Object.fromEntries(
    Object.entries(value ?? {})
      .map(([field, label]) => [field, label.trim()])
      .filter(([, label]) => label.length > 0),
  );

const buildDraftFromLayer = (layer: GeoPlusLayerItem): LayerInteractionDraft => ({
  labelEnabled: Boolean(layer.labelEnabled && layer.labelField),
  labelField: layer.labelField ?? "",
  labelColor: layer.styleConfig?.labelColor ?? "#0f766e",
  labelSize: layer.styleConfig?.labelSize ?? 13,
  tooltipEnabled: layer.interactionConfig?.tooltipEnabled !== false,
  tooltipFields: [...(layer.interactionConfig?.tooltipFields ?? [])],
  popupEnabled: layer.interactionConfig?.popupEnabled !== false,
  popupFields: [...(layer.interactionConfig?.popupFields ?? [])],
  fieldDisplayNames: { ...(layer.interactionConfig?.fieldDisplayNames ?? {}) },
  hoverHighlightEnabled: layer.interactionConfig?.hoverHighlightEnabled !== false,
  hoverHighlightColor: layer.interactionConfig?.hoverHighlightColor ?? "#22d3ee",
  hoverLineColor: layer.interactionConfig?.hoverLineColor ?? layer.interactionConfig?.hoverHighlightColor ?? "#22d3ee",
  hoverFillOpacity: layer.interactionConfig?.hoverFillOpacity ?? 0.26,
  hoverLineWidth: layer.interactionConfig?.hoverLineWidth ?? 3.4,
  hoverPointRadius: layer.interactionConfig?.hoverPointRadius ?? 9.2,
});

const toNormalizedDraft = (draft: LayerInteractionDraft) => ({
  labelEnabled: Boolean(draft.labelEnabled && draft.labelField.trim()),
  labelField: draft.labelField.trim(),
  labelColor: draft.labelColor.trim().toLowerCase(),
  labelSize: Number(draft.labelSize),
  tooltipEnabled: draft.tooltipEnabled,
  tooltipFields: [...draft.tooltipFields].sort(),
  popupEnabled: draft.popupEnabled,
  popupFields: [...draft.popupFields].sort(),
  fieldDisplayNames: normalizeFieldDisplayNames(draft.fieldDisplayNames),
  hoverHighlightEnabled: draft.hoverHighlightEnabled,
  hoverHighlightColor: draft.hoverHighlightColor.trim().toLowerCase(),
  hoverLineColor: draft.hoverLineColor.trim().toLowerCase(),
  hoverFillOpacity: Number(draft.hoverFillOpacity.toFixed(2)),
  hoverLineWidth: Number(draft.hoverLineWidth.toFixed(2)),
  hoverPointRadius: Number(draft.hoverPointRadius.toFixed(2)),
});

const supportsFeatureInteractions = (layer: GeoPlusLayerItem) =>
  layer.layerType === "geojson" || layer.layerType === "scatterplot" || layer.layerType === "mvt";

const getHoverInteractionCapabilities = (layer: GeoPlusLayerItem, supportsInteraction: boolean) => {
  if (!supportsInteraction) {
    return { point: false, line: false, polygon: false };
  }

  if (layer.layerType === "scatterplot") {
    return { point: true, line: false, polygon: false };
  }

  const geometryFamilies = getLayerGeometryFamilies(layer);
  if (geometryFamilies.length > 0) {
    return {
      point: geometryFamilies.includes("Point"),
      line: geometryFamilies.includes("Line"),
      polygon: geometryFamilies.includes("Polygon"),
    };
  }

  return { point: true, line: true, polygon: true };
};

export function LayerInteractionDialog({
  layer,
  isOpen,
  onClose,
  onUpdateLabelConfig,
  onUpdateInteractionConfig,
  onUpdateStyleConfig,
}: LayerInteractionDialogProps) {
  const [activeTab, setActiveTab] = useState<"labels" | "tooltips" | "popups">("labels");
  const [draft, setDraft] = useState<LayerInteractionDraft>(() => buildDraftFromLayer(layer));

  const fields = getLayerLabelFieldOptions(layer);
  const hasFields = fields.length > 0;
  const supportsInteraction = supportsFeatureInteractions(layer);
  const hoverCapabilities = useMemo(
    () => getHoverInteractionCapabilities(layer, supportsInteraction),
    [layer, supportsInteraction],
  );
  const hasPendingChanges = useMemo(
    () => JSON.stringify(toNormalizedDraft(draft)) !== JSON.stringify(toNormalizedDraft(buildDraftFromLayer(layer))),
    [draft, layer],
  );

  const toggleTooltipField = (field: string) => {
    setDraft((current) => {
      const next = current.tooltipFields.includes(field)
        ? current.tooltipFields.filter((item) => item !== field)
        : [...current.tooltipFields, field];
      return {
        ...current,
        tooltipFields: next,
      };
    });
  };

  const togglePopupField = (field: string) => {
    setDraft((current) => {
      const next = current.popupFields.includes(field)
        ? current.popupFields.filter((item) => item !== field)
        : [...current.popupFields, field];
      return {
        ...current,
        popupFields: next,
      };
    });
  };

  const updateFieldDisplayName = (field: string, value: string) => {
    setDraft((current) => ({
      ...current,
      fieldDisplayNames: {
        ...current.fieldDisplayNames,
        [field]: value,
      },
    }));
  };

  const applyChanges = () => {
    const nextLabelField = draft.labelField.trim();
    onUpdateLabelConfig(layer.id, {
      enabled: draft.labelEnabled && Boolean(nextLabelField),
      field: nextLabelField,
    });

    onUpdateStyleConfig(layer.id, {
      labelColor: draft.labelColor,
      labelSize: draft.labelSize,
    });

    onUpdateInteractionConfig(
      layer.id,
      supportsInteraction
        ? {
            tooltipEnabled: draft.tooltipEnabled,
            popupEnabled: draft.popupEnabled,
            tooltipFields: draft.tooltipFields.length > 0 ? draft.tooltipFields : [],
            popupFields: draft.popupFields.length > 0 ? draft.popupFields : [],
            fieldDisplayNames: normalizeFieldDisplayNames(draft.fieldDisplayNames),
            hoverHighlightEnabled: draft.hoverHighlightEnabled,
            hoverHighlightColor: draft.hoverHighlightColor,
            hoverLineColor: draft.hoverLineColor,
            hoverFillOpacity: draft.hoverFillOpacity,
            hoverLineWidth: draft.hoverLineWidth,
            hoverPointRadius: draft.hoverPointRadius,
          }
        : {
            tooltipEnabled: false,
            popupEnabled: false,
            tooltipFields: [],
            popupFields: [],
            hoverHighlightEnabled: false,
            hoverLineColor: undefined,
            hoverFillOpacity: undefined,
            hoverLineWidth: undefined,
            hoverPointRadius: undefined,
          },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md h-[min(80vh,44rem)] border-border/80 bg-background sm:rounded-2xl overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="shrink-0 p-5 pb-4 border-b border-border/50 bg-muted/20">
          <DialogTitle className="flex items-center gap-2 text-lg text-foreground">
            <Settings2 className="size-5 text-accent" />
            Labels & Interactions
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">Configure map labels, tooltips, and click popups for &quot;{layer.name}&quot;.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 flex border-b border-border/50 bg-muted/10">
          {[
            { id: "labels", label: "Labels", icon: Type },
            { id: "tooltips", label: "Tooltips", icon: MessageSquare },
            { id: "popups", label: "Popups", icon: MousePointerClick },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "labels" | "tooltips" | "popups")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-accent text-accent bg-background"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 p-5 overflow-y-auto geoplus-panel-scroll bg-background">
          {activeTab === "labels" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="space-y-0.5">
                  <h4 className="font-medium text-foreground">Show Labels</h4>
                  <p className="text-xs text-muted-foreground">Display text labels on the map.</p>
                </div>
                <SquareSwitch
                  checked={draft.labelEnabled}
                  onCheckedChange={(checked) => {
                    setDraft((current) => ({
                      ...current,
                      labelEnabled: checked,
                      labelField: checked && !current.labelField && hasFields ? fields[0] : current.labelField,
                    }));
                  }}
                  disabled={!hasFields}
                />
              </div>

              {hasFields ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Label Field</label>
                    <select
                      value={draft.labelField}
                      onChange={(e) => {
                        const field = e.target.value.trim();
                        setDraft((current) => ({
                          ...current,
                          labelField: field,
                          labelEnabled: Boolean(field),
                        }));
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      <option value="">Select a property</option>
                      {fields.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Text Color</label>
                      <div className="flex h-9 overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-accent">
                        <input
                          type="color"
                          value={draft.labelColor}
                          onChange={(e) => setDraft((current) => ({ ...current, labelColor: e.target.value }))}
                          className="h-full w-12 cursor-pointer border-0 p-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={draft.labelColor}
                          onChange={(e) => setDraft((current) => ({ ...current, labelColor: e.target.value }))}
                          className="flex-1 bg-background px-3 text-xs uppercase focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Text Size</label>
                      <div className="flex h-9 items-center gap-3 rounded-md border border-input px-3">
                        <Type className="size-3.5 text-muted-foreground shrink-0" />
                        <input
                          type="range"
                          min={9}
                          max={28}
                          step={1}
                          value={draft.labelSize}
                          onChange={(e) => setDraft((current) => ({ ...current, labelSize: Number(e.target.value) }))}
                          className="w-full accent-accent"
                        />
                        <span className="w-6 text-right text-xs font-medium text-muted-foreground shrink-0">
                          {draft.labelSize}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  No attributes available for labeling.
                </div>
              )}
            </div>
          )}

          {activeTab === "tooltips" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="space-y-0.5">
                  <h4 className="font-medium text-foreground">Enable Tooltips</h4>
                  <p className="text-xs text-muted-foreground">Show hover information for features.</p>
                </div>
                <SquareSwitch
                  checked={draft.tooltipEnabled}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, tooltipEnabled: checked }))}
                  disabled={!supportsInteraction}
                />
              </div>

              {!supportsInteraction ? (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  This layer type does not support feature hover interactions (tooltips/highlight). Try vector layers such as GeoJSON, scatterplot, or MVT.
                </div>
              ) : null}

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="font-medium text-foreground">Hover Highlight</h4>
                    <p className="text-xs text-muted-foreground">Highlight hovered feature on the map.</p>
                  </div>
                  <SquareSwitch
                    checked={draft.hoverHighlightEnabled}
                    onCheckedChange={(checked) => setDraft((current) => ({ ...current, hoverHighlightEnabled: checked }))}
                    disabled={!supportsInteraction}
                  />
                </div>
                {(hoverCapabilities.point || hoverCapabilities.polygon) && (
                  <div className="mt-3 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Fill / Point Color</label>
                    <div className="flex h-9 overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-accent">
                      <input
                        type="color"
                        value={draft.hoverHighlightColor}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverHighlightColor: event.target.value }))}
                        className="h-full w-12 cursor-pointer border-0 p-0 bg-transparent"
                        disabled={!supportsInteraction}
                      />
                      <input
                        type="text"
                        value={draft.hoverHighlightColor}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverHighlightColor: event.target.value }))}
                        className="flex-1 bg-background px-3 text-xs uppercase focus:outline-none"
                        disabled={!supportsInteraction}
                      />
                    </div>
                  </div>
                )}

                {(hoverCapabilities.line || hoverCapabilities.polygon) && (
                  <div className="mt-3 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Line Color</label>
                    <div className="flex h-9 overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-accent">
                      <input
                        type="color"
                        value={draft.hoverLineColor}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverLineColor: event.target.value }))}
                        className="h-full w-12 cursor-pointer border-0 p-0 bg-transparent"
                        disabled={!supportsInteraction}
                      />
                      <input
                        type="text"
                        value={draft.hoverLineColor}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverLineColor: event.target.value }))}
                        className="flex-1 bg-background px-3 text-xs uppercase focus:outline-none"
                        disabled={!supportsInteraction}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {hoverCapabilities.polygon && (
                    <label className="space-y-1">
                      <span className="text-[0.65rem] font-medium text-muted-foreground">Fill Opacity</span>
                      <input
                        type="range"
                        min={0}
                        max={0.8}
                        step={0.02}
                        value={draft.hoverFillOpacity}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverFillOpacity: Number(event.target.value) }))}
                        className="w-full accent-accent"
                        disabled={!supportsInteraction}
                      />
                      <span className="text-[0.62rem] text-muted-foreground">{Math.round(draft.hoverFillOpacity * 100)}%</span>
                    </label>
                  )}

                  {(hoverCapabilities.line || hoverCapabilities.polygon) && (
                    <label className="space-y-1">
                      <span className="text-[0.65rem] font-medium text-muted-foreground">Line Width</span>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={0.2}
                        value={draft.hoverLineWidth}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverLineWidth: Number(event.target.value) }))}
                        className="w-full accent-accent"
                        disabled={!supportsInteraction}
                      />
                      <span className="text-[0.62rem] text-muted-foreground">{draft.hoverLineWidth.toFixed(1)}px</span>
                    </label>
                  )}

                  {hoverCapabilities.point && (
                    <label className="space-y-1">
                      <span className="text-[0.65rem] font-medium text-muted-foreground">Point Size</span>
                      <input
                        type="range"
                        min={4}
                        max={16}
                        step={0.2}
                        value={draft.hoverPointRadius}
                        onChange={(event) => setDraft((current) => ({ ...current, hoverPointRadius: Number(event.target.value) }))}
                        className="w-full accent-accent"
                        disabled={!supportsInteraction}
                      />
                      <span className="text-[0.62rem] text-muted-foreground">{draft.hoverPointRadius.toFixed(1)}px</span>
                    </label>
                  )}
                </div>
              </div>

              {supportsInteraction && hasFields && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Fields to Display</label>
                  <p className="text-xs text-muted-foreground mb-2">If none selected, displays all available fields by default.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {fields.map((f) => {
                      const isSelected = draft.tooltipFields.includes(f);
                      return (
                        <label
                          key={f}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                            isSelected ? "border-accent/50 bg-accent/10 text-accent" : "border-border hover:bg-muted/50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTooltipField(f)}
                            className="accent-accent"
                          />
                          <span className="truncate">{f}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Display Field Names</p>
                    {(draft.tooltipFields.length > 0 ? draft.tooltipFields : fields).map((field) => (
                      <div key={`tooltip-display-${field}`} className="grid grid-cols-[10rem_1fr] items-center gap-2">
                        <span className="truncate text-xs text-foreground/80">{field}</span>
                        <input
                          type="text"
                          value={draft.fieldDisplayNames[field] ?? ""}
                          onChange={(event) => updateFieldDisplayName(field, event.target.value)}
                          placeholder={field}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "popups" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="space-y-0.5">
                  <h4 className="font-medium text-foreground">Enable Popups</h4>
                  <p className="text-xs text-muted-foreground">Show detailed table on click.</p>
                </div>
                <SquareSwitch
                  checked={draft.popupEnabled}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, popupEnabled: checked }))}
                  disabled={!supportsInteraction}
                />
              </div>

              {!supportsInteraction ? (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  This layer type does not support feature click popups. Try vector layers such as GeoJSON, scatterplot, or MVT.
                </div>
              ) : null}

              {supportsInteraction && hasFields && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Fields to Display</label>
                  <p className="text-xs text-muted-foreground mb-2">If none selected, displays all available fields by default.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {fields.map((f) => {
                      const isSelected = draft.popupFields.includes(f);
                      return (
                        <label
                          key={f}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                            isSelected ? "border-accent/50 bg-accent/10 text-accent" : "border-border hover:bg-muted/50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePopupField(f)}
                            className="accent-accent"
                          />
                          <span className="truncate">{f}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Display Field Names</p>
                    {(draft.popupFields.length > 0 ? draft.popupFields : fields).map((field) => (
                      <div key={`popup-display-${field}`} className="grid grid-cols-[10rem_1fr] items-center gap-2">
                        <span className="truncate text-xs text-foreground/80">{field}</span>
                        <input
                          type="text"
                          value={draft.fieldDisplayNames[field] ?? ""}
                          onChange={(event) => updateFieldDisplayName(field, event.target.value)}
                          placeholder={field}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 p-4 bg-muted/10 border-t border-border/50 sm:justify-between">
          <Button type="button" onClick={applyChanges} disabled={!hasPendingChanges}>
            Apply
          </Button>
          <DialogClose asChild>
            <Button variant="outline" className="w-full sm:w-auto">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
