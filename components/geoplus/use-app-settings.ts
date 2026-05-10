"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoPlusBasemapId } from "@/components/geoplus/map-style";

const APP_SETTINGS_KEY = "geoplus-app-settings";
const APP_SETTINGS_SYNC_EVENT = "geoplus-app-settings-sync";
const FALLBACK_DEFAULT_BASEMAP_ID: GeoPlusBasemapId = "satellite";
const VALID_BASEMAP_IDS = new Set<GeoPlusBasemapId>(["dark", "light", "satellite", "osm", "terrain", "none"]);
const VALID_THEMES = new Set<AppTheme>(["dark", "light", "system"]);

export type AppTheme = "dark" | "light" | "system";
export type ControlPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type ControlOrientation = "vertical" | "horizontal";
export type StandardControlLayout = "default" | "compact";
export type StandardControlItem = "search" | "zoom" | "compass" | "view3d" | "projection" | "legend" | "locate" | "fullscreen";
export type ControlGroupLayout = "split" | "compact";
export type ControlGroupSetting = {
  id: string;
  name: string;
  position: ControlPosition;
  orientation: ControlOrientation;
  layout: ControlGroupLayout;
  items: StandardControlItem[];
};

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
  mapControlPosition: ControlPosition;
  mapControlOrientation: ControlOrientation;
  standardControlLayout: StandardControlLayout;
  standardControlItems: StandardControlItem[];
  customControlGroups: ControlGroupSetting[];
  drawControlPosition: ControlPosition;
  drawControlOrientation: ControlOrientation;
  defaultBasemap: GeoPlusBasemapId;
  autoZoomToLayers: boolean;
  showLayerTooltips: boolean;
  showLayerPopups: boolean;
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
  mapControlPosition: "top-right",
  mapControlOrientation: "vertical",
  standardControlLayout: "default",
  standardControlItems: ["search", "zoom", "compass", "view3d", "projection", "legend", "locate", "fullscreen"],
  customControlGroups: [],
  drawControlPosition: "top-left",
  drawControlOrientation: "vertical",
  defaultBasemap: FALLBACK_DEFAULT_BASEMAP_ID,
  autoZoomToLayers: true,
  showLayerTooltips: true,
  showLayerPopups: true,
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

const normalizeControlPosition = (value: unknown, fallback: ControlPosition): ControlPosition => {
  if (value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right") {
    return value;
  }
  return fallback;
};

const normalizeControlOrientation = (value: unknown, fallback: ControlOrientation): ControlOrientation => {
  if (value === "vertical" || value === "horizontal") {
    return value;
  }
  return fallback;
};

const normalizeStandardControlLayout = (value: unknown): StandardControlLayout => {
  if (value === "compact" || value === "default") {
    return value;
  }
  return defaultSettings.standardControlLayout;
};

const normalizeControlGroupLayout = (value: unknown): ControlGroupLayout => {
  if (value === "compact" || value === "split") {
    return value;
  }
  return "split";
};

const VALID_STANDARD_CONTROL_ITEMS = new Set<StandardControlItem>([
  "search",
  "zoom",
  "compass",
  "view3d",
  "projection",
  "legend",
  "locate",
  "fullscreen",
]);

const normalizeStandardControlItems = (value: unknown): StandardControlItem[] => {
  if (!Array.isArray(value)) {
    return defaultSettings.standardControlItems;
  }
  const seen = new Set<StandardControlItem>();
  const normalized: StandardControlItem[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const typedItem = item as StandardControlItem;
    if (!VALID_STANDARD_CONTROL_ITEMS.has(typedItem) || seen.has(typedItem)) {
      continue;
    }
    seen.add(typedItem);
    normalized.push(typedItem);
  }
  return normalized;
};

const normalizeCustomControlGroups = (value: unknown): ControlGroupSetting[] => {
  if (!Array.isArray(value)) {
    return defaultSettings.customControlGroups;
  }
  const normalized: ControlGroupSetting[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const typedCandidate = candidate as Partial<ControlGroupSetting>;
    const id = typeof typedCandidate.id === "string" ? typedCandidate.id.trim() : "";
    const name = typeof typedCandidate.name === "string" ? typedCandidate.name.trim() : "";
    if (!id || !name) {
      continue;
    }
    normalized.push({
      id,
      name,
      position: normalizeControlPosition(typedCandidate.position, "top-right"),
      orientation: normalizeControlOrientation(typedCandidate.orientation, "vertical"),
      layout: normalizeControlGroupLayout(typedCandidate.layout),
      items: normalizeStandardControlItems(typedCandidate.items),
    });
  }
  return normalized;
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

const normalizeTheme = (value: unknown): AppTheme => {
  if (typeof value !== "string") {
    return defaultSettings.theme;
  }
  return VALID_THEMES.has(value as AppTheme) ? (value as AppTheme) : defaultSettings.theme;
};

const normalizeSettings = (value: unknown): AppSettings => {
  const candidate = value && typeof value === "object" ? (value as Partial<AppSettings>) : {};
  return {
    theme: normalizeTheme(candidate.theme),
    showZoomControl: candidate.showZoomControl ?? defaultSettings.showZoomControl,
    showSearchControl: candidate.showSearchControl ?? defaultSettings.showSearchControl,
    showScaleBar: candidate.showScaleBar ?? defaultSettings.showScaleBar,
    showCompass: candidate.showCompass ?? defaultSettings.showCompass,
    showFullscreenControl: candidate.showFullscreenControl ?? defaultSettings.showFullscreenControl,
    showThemeToggle: candidate.showThemeToggle ?? defaultSettings.showThemeToggle,
    mapControlPosition: normalizeControlPosition(candidate.mapControlPosition, defaultSettings.mapControlPosition),
    mapControlOrientation: normalizeControlOrientation(candidate.mapControlOrientation, defaultSettings.mapControlOrientation),
    standardControlLayout: normalizeStandardControlLayout(candidate.standardControlLayout),
    standardControlItems: normalizeStandardControlItems(candidate.standardControlItems),
    customControlGroups: normalizeCustomControlGroups(candidate.customControlGroups),
    drawControlPosition: normalizeControlPosition(candidate.drawControlPosition, defaultSettings.drawControlPosition),
    drawControlOrientation: normalizeControlOrientation(candidate.drawControlOrientation, defaultSettings.drawControlOrientation),
    defaultBasemap: normalizeBasemapId(candidate.defaultBasemap),
    autoZoomToLayers: candidate.autoZoomToLayers ?? defaultSettings.autoZoomToLayers,
    showLayerTooltips: candidate.showLayerTooltips ?? defaultSettings.showLayerTooltips,
    showLayerPopups: candidate.showLayerPopups ?? defaultSettings.showLayerPopups,
    layerTools: normalizeLayerTools(candidate.layerTools),
  };
};

export type AppSettingsUpdate = Omit<Partial<AppSettings>, "layerTools"> & {
  layerTools?: Partial<LayerToolSettings>;
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const broadcastTimeoutRef = useRef<number | null>(null);

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
      const nextSettings = readPersistedSettings();
      setSettings((previousSettings) => {
        return JSON.stringify(previousSettings) === JSON.stringify(nextSettings) ? previousSettings : nextSettings;
      });
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
      if (broadcastTimeoutRef.current !== null) {
        window.clearTimeout(broadcastTimeoutRef.current);
        broadcastTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      root.classList.remove("light", "dark");
      if (settings.theme === "system") {
        root.classList.add(mediaQuery.matches ? "dark" : "light");
        return;
      }
      root.classList.add(settings.theme);
    };

    applyTheme();

    if (settings.theme !== "system") {
      return;
    }

    const handleSystemThemeChange = () => applyTheme();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    }

    mediaQuery.addListener(handleSystemThemeChange);
    return () => {
      mediaQuery.removeListener(handleSystemThemeChange);
    };
  }, [settings.theme, isLoaded]);

  const updateSettings = (newSettings: AppSettingsUpdate) => {
    let updatedSettings: AppSettings | null = null;
    setSettings((previousSettings) => {
      updatedSettings = {
        ...previousSettings,
        ...newSettings,
        layerTools: newSettings.layerTools
          ? { ...previousSettings.layerTools, ...newSettings.layerTools }
          : previousSettings.layerTools,
      };
      return updatedSettings;
    });

    if (!updatedSettings) {
      return;
    }

    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(updatedSettings));
    if (broadcastTimeoutRef.current !== null) {
      window.clearTimeout(broadcastTimeoutRef.current);
    }
    broadcastTimeoutRef.current = window.setTimeout(() => {
      window.dispatchEvent(new Event(APP_SETTINGS_SYNC_EVENT));
      broadcastTimeoutRef.current = null;
    }, 0);
  };

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
