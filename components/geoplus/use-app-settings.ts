"use client";

import { useEffect, useState } from "react";
import type { GeoPlusBasemapId } from "@/components/geoplus/map-style";

const APP_SETTINGS_KEY = "geoplus-app-settings";
const APP_SETTINGS_SYNC_EVENT = "geoplus-app-settings-sync";
const FALLBACK_DEFAULT_BASEMAP_ID: GeoPlusBasemapId = "satellite";
const VALID_BASEMAP_IDS = new Set<GeoPlusBasemapId>(["dark", "light", "satellite", "osm", "terrain", "none"]);

export type AppTheme = "dark" | "light" | "system";
export type LayerToolSettings = {
  showInfo: boolean;
  showRename: boolean;
  showZoom: boolean;
  showTable: boolean;
  showChart: boolean;
  showLabels: boolean;
  showStyle: boolean;
  showMore: boolean;
};

export type AppSettings = {
  theme: AppTheme;
  showZoomControl: boolean;
  showSearchControl: boolean;
  showScaleBar: boolean;
  showCompass: boolean;
  showFullscreenControl: boolean;
  showThemeToggle: boolean;
  defaultBasemap: GeoPlusBasemapId;
  autoZoomToLayers: boolean;
  showLayerTooltips: boolean;
  layerTools: LayerToolSettings;
};

const defaultSettings: AppSettings = {
  theme: "dark",
  showZoomControl: true,
  showSearchControl: true,
  showScaleBar: true,
  showCompass: true,
  showFullscreenControl: true,
  showThemeToggle: true,
  defaultBasemap: FALLBACK_DEFAULT_BASEMAP_ID,
  autoZoomToLayers: true,
  showLayerTooltips: true,
  layerTools: {
    showInfo: true,
    showRename: true,
    showZoom: true,
    showTable: true,
    showChart: true,
    showLabels: true,
    showStyle: true,
    showMore: true,
  },
};

const normalizeBasemapId = (value: unknown): GeoPlusBasemapId => {
  if (typeof value !== "string") {
    return FALLBACK_DEFAULT_BASEMAP_ID;
  }
  return VALID_BASEMAP_IDS.has(value as GeoPlusBasemapId) ? (value as GeoPlusBasemapId) : FALLBACK_DEFAULT_BASEMAP_ID;
};

const normalizeLayerTools = (value: unknown): LayerToolSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<LayerToolSettings>) : {};
  return {
    showInfo: candidate.showInfo ?? defaultSettings.layerTools.showInfo,
    showRename: candidate.showRename ?? defaultSettings.layerTools.showRename,
    showZoom: candidate.showZoom ?? defaultSettings.layerTools.showZoom,
    showTable: candidate.showTable ?? defaultSettings.layerTools.showTable,
    showChart: candidate.showChart ?? defaultSettings.layerTools.showChart,
    showLabels: candidate.showLabels ?? defaultSettings.layerTools.showLabels,
    showStyle: candidate.showStyle ?? defaultSettings.layerTools.showStyle,
    showMore: candidate.showMore ?? defaultSettings.layerTools.showMore,
  };
};

const normalizeSettings = (value: unknown): AppSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<AppSettings>) : {};
  return {
    theme: candidate.theme ?? defaultSettings.theme,
    showZoomControl: candidate.showZoomControl ?? defaultSettings.showZoomControl,
    showSearchControl: candidate.showSearchControl ?? defaultSettings.showSearchControl,
    showScaleBar: candidate.showScaleBar ?? defaultSettings.showScaleBar,
    showCompass: candidate.showCompass ?? defaultSettings.showCompass,
    showFullscreenControl: candidate.showFullscreenControl ?? defaultSettings.showFullscreenControl,
    showThemeToggle: candidate.showThemeToggle ?? defaultSettings.showThemeToggle,
    defaultBasemap: normalizeBasemapId(candidate.defaultBasemap),
    autoZoomToLayers: candidate.autoZoomToLayers ?? defaultSettings.autoZoomToLayers,
    showLayerTooltips: candidate.showLayerTooltips ?? defaultSettings.showLayerTooltips,
    layerTools: normalizeLayerTools(candidate.layerTools),
  };
};

type AppSettingsUpdate = Omit<Partial<AppSettings>, "layerTools"> & {
  layerTools?: Partial<LayerToolSettings>;
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const readPersistedSettings = () => {
      const saved = localStorage.getItem(APP_SETTINGS_KEY);
      if (!saved) {
        return defaultSettings;
      }
      try {
        return normalizeSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse app settings", e);
        return defaultSettings;
      }
    };

    const syncFromStorage = () => {
      setSettings(readPersistedSettings());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== APP_SETTINGS_KEY) {
        return;
      }
      syncFromStorage();
    };

    const onAppSettingsSync = () => {
      syncFromStorage();
    };

    syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(APP_SETTINGS_SYNC_EVENT, onAppSettingsSync);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoaded(true);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_SETTINGS_SYNC_EVENT, onAppSettingsSync);
    };
  }, []);

  useEffect(() => {
    if (isLoaded) {
      // Apply theme to document
      const applyTheme = (theme: AppTheme) => {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        if (theme === "system") {
          const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
          root.classList.add(systemTheme);
        } else {
          root.classList.add(theme);
        }
      };
      
      applyTheme(settings.theme);
    }
  }, [settings.theme, isLoaded]);

  const updateSettings = (newSettings: AppSettingsUpdate) => {
    setSettings((prev) => {
      const updated: AppSettings = {
        ...prev,
        ...newSettings,
        layerTools: newSettings.layerTools ? { ...prev.layerTools, ...newSettings.layerTools } : prev.layerTools,
      };
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(APP_SETTINGS_SYNC_EVENT));
      return updated;
    });
  };

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
