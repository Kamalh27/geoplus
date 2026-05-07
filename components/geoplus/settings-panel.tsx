"use client";

import {
  BarChart3,
  Compass,
  EllipsisVertical,
  Focus,
  Globe,
  Info,
  Map,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Ruler,
  Search,
  Settings2,
  Sun,
  Table2,
  Type,
  Zap,
  ZoomIn,
} from "lucide-react";
import { GEOPLUS_BASEMAP_OPTIONS, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import { useAppSettings } from "./use-app-settings";
import { SquareSwitch } from "@/components/ui/square-switch";

export function SettingsPanel() {
  const { settings, updateSettings, isLoaded } = useAppSettings();

  if (!isLoaded) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="size-4 text-accent" />
          Settings
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label="Settings info"
              className="inline-flex size-3 items-center justify-center rounded text-muted-foreground transition hover:text-foreground -translate-y-[0.28rem]"
            >
              <Info className="size-3" />
            </button>
            <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 w-64 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2.5 py-2 text-[0.66rem] font-medium leading-snug text-card-foreground opacity-0 shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition-opacity duration-150 group-hover:opacity-100">
              Configure workspace behavior, map controls, and which layer actions appear in the layer panel.
            </span>
          </span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Theme Settings */}
        <section className="space-y-3">
          <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Theme Settings</h3>
          <div className="rounded-lg border border-border/50 bg-card/40 p-1">
            <div className="flex rounded-md bg-muted/40 p-1 gap-1">
              <button
                onClick={() => updateSettings({ theme: "light" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors ${
                  settings.theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sun className="size-3.5" />
                Light
              </button>
              <button
                onClick={() => updateSettings({ theme: "dark" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors ${
                  settings.theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Moon className="size-3.5" />
                Dark
              </button>
              <button
                onClick={() => updateSettings({ theme: "system" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-sm py-1.5 text-xs font-medium transition-colors ${
                  settings.theme === "system" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Monitor className="size-3.5" />
                System
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                <Moon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Theme Toggle Button</p>
                <p className="text-[0.65rem] text-muted-foreground">Show or hide theme toggle in the header</p>
              </div>
            </div>
            <SquareSwitch checked={settings.showThemeToggle} onCheckedChange={(c) => updateSettings({ showThemeToggle: c })} />
          </label>
        </section>

        {/* Basemap Defaults */}
        <section className="space-y-3">
          <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Basemap Defaults</h3>
          <div className="rounded-lg border border-border/50 bg-card/40 p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                <Globe className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Default Basemap</p>
                <p className="text-[0.65rem] text-muted-foreground">Set startup basemap for your workspace</p>
              </div>
            </div>
            <select
              value={settings.defaultBasemap}
              onChange={(event) => updateSettings({ defaultBasemap: event.target.value as GeoPlusBasemapId })}
              className="mt-3 h-9 w-full rounded-md border border-border/70 bg-background/80 px-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/60"
            >
              {GEOPLUS_BASEMAP_OPTIONS.map((basemap) => (
                <option key={basemap.id} value={basemap.id}>
                  {basemap.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Map Controls */}
        <section className="space-y-3">
          <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Map Controls</h3>
          <div className="space-y-2">
            
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <ZoomIn className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Zoom Controls</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show +/- buttons on the map</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showZoomControl} 
                onCheckedChange={(c) => updateSettings({ showZoomControl: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Search className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Search</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show geocoding search panel</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showSearchControl} 
                onCheckedChange={(c) => updateSettings({ showSearchControl: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Compass className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Compass</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show map bearing/pitch reset</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showCompass} 
                onCheckedChange={(c) => updateSettings({ showCompass: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Ruler className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Scale Bar</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show distance scale at the bottom</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showScaleBar} 
                onCheckedChange={(c) => updateSettings({ showScaleBar: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Map className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Fullscreen</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show fullscreen toggle</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showFullscreenControl} 
                onCheckedChange={(c) => updateSettings({ showFullscreenControl: c })} 
              />
            </label>

          </div>
        </section>

        {/* Layer Settings */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
            Layer Settings
            <span className="group relative inline-flex">
              <button
                type="button"
                aria-label="Layer settings info"
                className="inline-flex size-3 items-center justify-center rounded text-muted-foreground transition hover:text-foreground -translate-y-[0.1rem]"
              >
                <Info className="size-3" />
              </button>
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 w-64 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2.5 py-2 text-[0.66rem] font-medium normal-case leading-snug tracking-normal text-card-foreground opacity-0 shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition-opacity duration-150 group-hover:opacity-100">
                Show or hide layer actions dynamically like zoom, table, chart, style, labels, and more actions.
              </span>
            </span>
          </h3>
          <div className="space-y-2">
            
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Zap className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Auto Zoom</p>
                  <p className="text-[0.65rem] text-muted-foreground">Zoom to layer bounds when added</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.autoZoomToLayers} 
                onCheckedChange={(c) => updateSettings({ autoZoomToLayers: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Info className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Tooltips</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show data tooltips on hover</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showLayerTooltips} 
                onCheckedChange={(c) => updateSettings({ showLayerTooltips: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Info className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Popups</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show detailed popups on click</p>
                </div>
              </div>
              <SquareSwitch 
                checked={settings.showLayerPopups} 
                onCheckedChange={(c) => updateSettings({ showLayerPopups: c })} 
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Info className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Layer Info Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show source and data details action</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showInfo} onCheckedChange={(c) => updateSettings({ layerTools: { showInfo: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Pencil className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Rename Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show rename button for each layer</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showRename} onCheckedChange={(c) => updateSettings({ layerTools: { showRename: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Focus className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Zoom Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show zoom to layer button in tools row</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showZoom} onCheckedChange={(c) => updateSettings({ layerTools: { showZoom: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Table2 className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Table Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show layer table button</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showTable} onCheckedChange={(c) => updateSettings({ layerTools: { showTable: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <BarChart3 className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Chart Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show layer chart button</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showChart} onCheckedChange={(c) => updateSettings({ layerTools: { showChart: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Palette className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Style Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show style modal button</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showStyle} onCheckedChange={(c) => updateSettings({ layerTools: { showStyle: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <Type className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Label Action</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show label configuration action</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showLabels} onCheckedChange={(c) => updateSettings({ layerTools: { showLabels: c } })} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 transition hover:bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-background/80 p-1.5 text-accent shadow-sm ring-1 ring-border/50">
                  <EllipsisVertical className="size-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">More Action Menu</p>
                  <p className="text-[0.65rem] text-muted-foreground">Show extra actions menu for opacity controls</p>
                </div>
              </div>
              <SquareSwitch checked={settings.layerTools.showMore} onCheckedChange={(c) => updateSettings({ layerTools: { showMore: c } })} />
            </label>

          </div>
        </section>

      </div>
    </div>
  );
}
