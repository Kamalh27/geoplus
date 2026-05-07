"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";

import { searchNominatimLocations } from "@/components/geoplus/map-search-service";
import { detectDarkMode, getBasemapStyle, type GeoPlusBasemapId } from "@/components/geoplus/map-style";
import type { GeoPlusLayerItem, NominatimSearchResult } from "@/components/geoplus/types";
import type { AppSettings } from "@/components/geoplus/use-app-settings";
import { buildDeckUserLayers, getGeoJsonLngLatBounds, getLayerLngLatBounds, syncMapLibreUserLayers, MAPLIBRE_LAYER_PREFIX } from "@/lib/geoplus/map-layer-renderers";
import { humanizeColumnName } from "@/lib/geoplus/duckdb-spatial-analytics";
import { registerCogProtocol, unregisterCogProtocol } from "@/lib/geoplus/tilesets/cog-maplibre";
import { registerPmtilesProtocol, unregisterPmtilesProtocol } from "@/lib/geoplus/tilesets/pmtiles-maplibre";
import { registerMbtilesProtocol } from "@/lib/geoplus/tilesets/mbtiles-maplibre";

const DEFAULT_FLAT_CENTER: [number, number] = [90.4125, 23.8103];
const DEFAULT_FLAT_ZOOM = 4;
const DEFAULT_GLOBE_CENTER: [number, number] = [0, 20];
const DEFAULT_GLOBE_ZOOM = 0;
const GLOBE_VIEW_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-170, -58],
  [170, 82],
];
type MapProjectionMode = "flat" | "globe";
const HOVER_HIGHLIGHT_SOURCE_ID = "geoplus-hover-highlight-source";
const HOVER_HIGHLIGHT_FILL_LAYER_ID = "geoplus-hover-highlight-fill";
const HOVER_HIGHLIGHT_LINE_LAYER_ID = "geoplus-hover-highlight-line";
const HOVER_HIGHLIGHT_POINT_LAYER_ID = "geoplus-hover-highlight-point";
const DEFAULT_HOVER_HIGHLIGHT_COLOR = "#22d3ee";
const EMPTY_HOVER_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const DEFAULT_HOVER_LINE_WIDTH = 3;
const DEFAULT_HOVER_FILL_OPACITY = 0.22;
const DEFAULT_HOVER_POINT_RADIUS = 8;

type HoverHighlightStyle = {
  color: string;
  lineColor: string;
  fillOpacity: number;
  lineWidth: number;
  pointRadius: number;
};

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveFieldLabel = (layer: GeoPlusLayerItem | undefined, field: string) =>
  layer?.interactionConfig?.fieldDisplayNames?.[field]?.trim() || humanizeColumnName(field);

const buildTooltipHtml = (layer: GeoPlusLayerItem | undefined, properties: Record<string, unknown>) => {
  const tooltipFields = layer?.interactionConfig?.tooltipFields;
  if (tooltipFields && tooltipFields.length > 0) {
    return tooltipFields
      .map((field) => `<b>${escapeHtml(resolveFieldLabel(layer, field))}:</b> ${escapeHtml(properties[field] ?? "N/A")}`)
      .join("<br>");
  }

  const fallbackFields = Object.keys(properties)
    .filter((field) => field !== "layer" && field !== "source")
    .filter((field) => {
      const value = properties[field];
      return value !== null && value !== undefined && typeof value !== "object";
    });

  if (fallbackFields.length > 0) {
    return fallbackFields
      .map((field) => `<b>${escapeHtml(resolveFieldLabel(layer, field))}:</b> ${escapeHtml(properties[field] ?? "N/A")}`)
      .join("<br>");
  }

  const title = properties.name ?? properties.title ?? properties.id ?? "Feature Details";
  return `<b>${escapeHtml(title)}</b>`;
};

const buildPopupHtml = (layer: GeoPlusLayerItem | undefined, properties: Record<string, unknown>) => {
  const popupFields = layer?.interactionConfig?.popupFields;
  const fields =
    popupFields && popupFields.length > 0
      ? popupFields
      : Object.keys(properties).filter((field) => field !== "layer" && field !== "source");
  const rows = fields
    .map((field) => {
      const value = properties[field];
      if (value === null || value === undefined || typeof value === "object") {
        return null;
      }
      return `<tr><td style="padding-right:12px; font-weight:600; vertical-align:top;">${escapeHtml(resolveFieldLabel(layer, field))}</td><td>${escapeHtml(value)}</td></tr>`;
    })
    .filter(Boolean)
    .join("");

  const bodyHtml =
    rows.length > 0
      ? `<div style="max-height: 220px; overflow-y: auto; padding: 6px 8px 8px;"><table style="font-size: 11px; width: 100%; border-collapse: separate; border-spacing: 0 3px;"><tbody>${rows}</tbody></table></div>`
      : `<div style="max-height: 220px; overflow-y: auto; padding: 6px 8px 8px; font-size: 11px;">No attributes available for this feature.</div>`;

  const title = "Information";
  const infoIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="display:block;">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
      <path d="M12 10v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      <circle cx="12" cy="7" r="1.2" fill="currentColor"></circle>
    </svg>
  `;

  return `
    <section style="min-width: 220px; max-width: 360px;">
      <header style="display:flex; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid rgba(148,163,184,0.25); padding:5px 8px;">
        <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; letter-spacing:0.02em;">
          <span style="display:inline-flex; align-items:center; color:inherit;">${infoIcon}</span>
          <span>${title}</span>
        </div>
        <button
          type="button"
          aria-label="Close information popup"
          onclick="this.closest('.maplibregl-popup')?.remove()"
          style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border:0; border-radius:4px; background:transparent; color:inherit; font-size:14px; line-height:1; cursor:pointer;"
        >
          ×
        </button>
      </header>
      ${bodyHtml}
    </section>
  `;
};

const isFeatureCollection = (value: unknown): value is GeoJSON.FeatureCollection =>
  Boolean(value) && typeof value === "object" && (value as { type?: string }).type === "FeatureCollection";

const ensureHoverHighlightLayers = (map: maplibregl.Map) => {
  if (!map.getSource(HOVER_HIGHLIGHT_SOURCE_ID)) {
    map.addSource(HOVER_HIGHLIGHT_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_HOVER_FEATURE_COLLECTION,
    });
  }

  if (!map.getLayer(HOVER_HIGHLIGHT_FILL_LAYER_ID)) {
    map.addLayer({
      id: HOVER_HIGHLIGHT_FILL_LAYER_ID,
      type: "fill",
      source: HOVER_HIGHLIGHT_SOURCE_ID,
      paint: {
        "fill-color": ["coalesce", ["get", "__highlightColor"], DEFAULT_HOVER_HIGHLIGHT_COLOR] as unknown as string,
        "fill-opacity": ["coalesce", ["get", "__highlightFillOpacity"], DEFAULT_HOVER_FILL_OPACITY] as unknown as number,
      },
    });
  }

  if (!map.getLayer(HOVER_HIGHLIGHT_LINE_LAYER_ID)) {
    map.addLayer({
      id: HOVER_HIGHLIGHT_LINE_LAYER_ID,
      type: "line",
      source: HOVER_HIGHLIGHT_SOURCE_ID,
      paint: {
        "line-color": ["coalesce", ["get", "__highlightLineColor"], ["get", "__highlightColor"], DEFAULT_HOVER_HIGHLIGHT_COLOR] as unknown as string,
        "line-width": ["coalesce", ["get", "__highlightLineWidth"], DEFAULT_HOVER_LINE_WIDTH] as unknown as number,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(HOVER_HIGHLIGHT_POINT_LAYER_ID)) {
    map.addLayer({
      id: HOVER_HIGHLIGHT_POINT_LAYER_ID,
      type: "circle",
      source: HOVER_HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": ["coalesce", ["get", "__highlightColor"], DEFAULT_HOVER_HIGHLIGHT_COLOR] as unknown as string,
        "circle-radius": ["coalesce", ["get", "__highlightPointRadius"], DEFAULT_HOVER_POINT_RADIUS] as unknown as number,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.92,
      },
    });
  }
};

const setHoverHighlightFeature = (map: maplibregl.Map, feature: GeoJSON.Feature, style: HoverHighlightStyle) => {
  ensureHoverHighlightLayers(map);
  const source = map.getSource(HOVER_HIGHLIGHT_SOURCE_ID);
  if (!source || !("setData" in source)) {
    return;
  }

  const featureWithColor: GeoJSON.Feature = {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      __highlightColor: style.color,
      __highlightLineColor: style.lineColor,
      __highlightLineWidth: style.lineWidth,
      __highlightFillOpacity: style.fillOpacity,
      __highlightPointRadius: style.pointRadius,
    },
  };
  (source as maplibregl.GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [featureWithColor],
  });
};

const clearHoverHighlightFeature = (map: maplibregl.Map) => {
  const source = map.getSource(HOVER_HIGHLIGHT_SOURCE_ID);
  if (!source || !("setData" in source)) {
    return;
  }
  (source as maplibregl.GeoJSONSource).setData(EMPTY_HOVER_FEATURE_COLLECTION);
};

const mapFeatureToGeoJsonFeature = (feature: maplibregl.MapGeoJSONFeature): GeoJSON.Feature | null => {
  if (!feature.geometry) {
    return null;
  }
  return {
    type: "Feature",
    geometry: feature.geometry as GeoJSON.Geometry,
    properties: feature.properties ?? {},
  };
};

const deckObjectToGeoJsonFeature = (object: Record<string, unknown>): GeoJSON.Feature | null => {
  if (isFeatureCollection(object)) {
    return object.features[0] ?? null;
  }

  const maybeFeature = object as {
    type?: string;
    geometry?: GeoJSON.Geometry;
    properties?: Record<string, unknown>;
    position?: [number, number];
  };

  if (maybeFeature.type === "Feature" && maybeFeature.geometry) {
    return {
      type: "Feature",
      geometry: maybeFeature.geometry,
      properties: maybeFeature.properties ?? {},
    };
  }

  if (Array.isArray(maybeFeature.position) && maybeFeature.position.length >= 2) {
    const longitude = Number(maybeFeature.position[0]);
    const latitude = Number(maybeFeature.position[1]);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        properties: maybeFeature.properties ?? object,
      };
    }
  }

  return null;
};

const getDeckClickLngLat = (map: maplibregl.Map, info: Record<string, unknown>, object: Record<string, unknown>): [number, number] | null => {
  const coordinate = info.coordinate as [number, number] | undefined;
  if (Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])) {
    return coordinate;
  }

  const x = Number(info.x);
  const y = Number(info.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const lngLat = map.unproject([x, y]);
    return [lngLat.lng, lngLat.lat];
  }

  const fallbackFeature = deckObjectToGeoJsonFeature(object);
  if (fallbackFeature?.geometry?.type === "Point" && Array.isArray(fallbackFeature.geometry.coordinates)) {
    const [lng, lat] = fallbackFeature.geometry.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  return null;
};

const supportsFeatureInteractions = (layer: GeoPlusLayerItem | undefined) => {
  if (!layer) {
    return false;
  }
  return layer.layerType === "geojson" || layer.layerType === "scatterplot" || layer.layerType === "mvt";
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildHoverHighlightStyle = (layer: GeoPlusLayerItem | undefined, geometryType: GeoJSON.Geometry["type"]): HoverHighlightStyle => {
  const isPointGeometry = geometryType === "Point" || geometryType === "MultiPoint";
  const isLineGeometry = geometryType === "LineString" || geometryType === "MultiLineString";
  const isPolygonGeometry = geometryType === "Polygon" || geometryType === "MultiPolygon";

  const defaultFillOpacity = isPolygonGeometry ? 0.26 : 0;
  const defaultLineWidth = isPolygonGeometry ? 3.4 : isLineGeometry ? 4.2 : 2.4;
  const defaultPointRadius = isPointGeometry ? 9.2 : 0;

  return {
    color: layer?.interactionConfig?.hoverHighlightColor ?? DEFAULT_HOVER_HIGHLIGHT_COLOR,
    lineColor: layer?.interactionConfig?.hoverLineColor ?? layer?.interactionConfig?.hoverHighlightColor ?? DEFAULT_HOVER_HIGHLIGHT_COLOR,
    fillOpacity: clampNumber(layer?.interactionConfig?.hoverFillOpacity ?? defaultFillOpacity, 0, 0.8),
    lineWidth: clampNumber(layer?.interactionConfig?.hoverLineWidth ?? defaultLineWidth, 1, 8),
    pointRadius: clampNumber(layer?.interactionConfig?.hoverPointRadius ?? defaultPointRadius, 0, 20),
  };
};

export function useGeoPlusMap(
  selectedBasemapId: GeoPlusBasemapId,
  userLayers: GeoPlusLayerItem[],
  hasOverlayLayers = false,
  zoomToLayerRequest: { layerId: string; nonce: number } | null = null,
  zoomToFeatureRequest: { feature: GeoJSON.Feature; nonce: number } | null = null,
  settings?: AppSettings,
) {
  const defaultProjectionMode: MapProjectionMode = hasOverlayLayers ? "flat" : "globe";
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);
  const scaleControlRef = useRef<maplibregl.ScaleControl | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipPopupRef = useRef<maplibregl.Popup | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const currentThemeRef = useRef<"dark" | "light" | null>(null);
  const deckHoverActiveRef = useRef(false);
  const selectedBasemapRef = useRef<GeoPlusBasemapId>(selectedBasemapId);
  const projectionModeRef = useRef<MapProjectionMode>(defaultProjectionMode);
  const userLayersRef = useRef<GeoPlusLayerItem[]>(userLayers);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isLegendPanelOpen, setIsLegendPanelOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
  const [mapViewMode, setMapViewMode] = useState<"2d" | "3d">("2d");
  const [mapProjectionMode, setMapProjectionMode] = useState<MapProjectionMode>(defaultProjectionMode);

  const applyProjectionMode = useCallback((map: maplibregl.Map, mode: MapProjectionMode) => {
    const projectionType = mode === "globe" ? "globe" : "mercator";
    const applyProjection = () => {
      try {
        map.setProjection({
          type: projectionType,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Style is not done loading")) {
          map.once("style.load", () => {
            map.setProjection({
              type: projectionType,
            });
          });
          return;
        }

        throw error;
      }
    };

    if (map.isStyleLoaded()) {
      applyProjection();
      return;
    }

    map.once("style.load", () => {
      applyProjection();
    });
  }, []);

  const fitGlobeToViewport = useCallback((map: maplibregl.Map, animate: boolean) => {
    const camera = map.cameraForBounds(GLOBE_VIEW_BOUNDS, {
      padding: {
        top: 36,
        right: 36,
        bottom: 36,
        left: 36,
      },
    });

    if (camera?.center && typeof camera.zoom === "number") {
      const nextCamera = {
        center: camera.center,
        zoom: camera.zoom,
        pitch: 0,
        bearing: 0,
        essential: true,
      };

      if (animate) {
        map.easeTo({
          ...nextCamera,
          duration: 420,
        });
      } else {
        map.jumpTo(nextCamera);
      }
      return;
    }

    const canvas = map.getCanvas();
    const minViewportSize = Math.max(320, Math.min(canvas.clientWidth, canvas.clientHeight));
    const fallbackZoom = Math.max(-1.5, Math.min(1.2, Math.log2(minViewportSize / 512)));
    const fallbackCamera = {
      center: DEFAULT_GLOBE_CENTER,
      zoom: fallbackZoom,
      pitch: 0,
      bearing: 0,
      essential: true,
    };

    if (animate) {
      map.easeTo({
        ...fallbackCamera,
        duration: 420,
      });
    } else {
      map.jumpTo(fallbackCamera);
    }
  }, []);

  const setStyleWithProjection = useCallback(
    (map: maplibregl.Map, style: maplibregl.StyleSpecification) => {
      map.setStyle(style);
      map.once("style.load", () => {
        applyProjectionMode(map, projectionModeRef.current);
      });
    },
    [applyProjectionMode],
  );

  const syncMapLibreLayers = useCallback((map: maplibregl.Map, layers: GeoPlusLayerItem[]) => {
    syncMapLibreUserLayers(map, layers);
  }, []);

  const syncDeckLayers = useCallback((map: maplibregl.Map, currentLayers: GeoPlusLayerItem[]) => {
    let overlay = deckOverlayRef.current;
    if (!overlay) {
      overlay = new MapboxOverlay({
        interleaved: true,
        layers: [],
      });
      map.addControl(overlay as unknown as maplibregl.IControl);
      deckOverlayRef.current = overlay;
    }

    const userDeckLayers = buildDeckUserLayers(currentLayers);

    overlay.setProps({
      layers: userDeckLayers,
      onHover: (info: Record<string, unknown>) => {
        if (settings?.showLayerTooltips === false) {
          deckHoverActiveRef.current = false;
          if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
          clearHoverHighlightFeature(map);
          map.getCanvas().style.cursor = "";
          return;
        }
        
        if (!info.object || !info.layer) {
          deckHoverActiveRef.current = false;
          if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
          clearHoverHighlightFeature(map);
          map.getCanvas().style.cursor = "";
          return;
        }

        const layerInfo = info.layer as { id: string };
        const rawId = layerInfo.id.replace(/^user-/, "");
        const appLayer = currentLayers.find((l) => {
          const safeId = l.id.replace(/[^a-zA-Z0-9_-]/g, "-");
          return rawId === safeId || rawId.startsWith(`${safeId}-`);
        });

        if (appLayer && supportsFeatureInteractions(appLayer) && appLayer.interactionConfig?.tooltipEnabled !== false) {
           deckHoverActiveRef.current = true;
           map.getCanvas().style.cursor = "pointer";
           const obj = info.object as Record<string, unknown>;
           const properties = (obj.properties as Record<string, unknown>) || obj;
           const html = buildTooltipHtml(appLayer, properties);
           const hoverFeature = deckObjectToGeoJsonFeature(obj);
           if (appLayer.interactionConfig?.hoverHighlightEnabled !== false && hoverFeature) {
             const hoverStyle = buildHoverHighlightStyle(appLayer, hoverFeature.geometry.type);
             setHoverHighlightFeature(map, hoverFeature, hoverStyle);
           } else {
             clearHoverHighlightFeature(map);
           }

           const coord = getDeckClickLngLat(map, info, obj);
           if (html && coord) {
             if (!tooltipPopupRef.current) {
                tooltipPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-tooltip" });
             }
             tooltipPopupRef.current.setLngLat([coord[0], coord[1]]).setHTML(html).addTo(map);
           }
        } else {
           deckHoverActiveRef.current = false;
           if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
           clearHoverHighlightFeature(map);
           map.getCanvas().style.cursor = "";
        }
      },
      onClick: (info: Record<string, unknown>) => {
        if (!info.object || !info.layer || settings?.showLayerPopups === false) return;
        
        const layerInfo = info.layer as { id: string };
        const rawId = layerInfo.id.replace(/^user-/, "");
        const appLayer = currentLayers.find((l) => {
          const safeId = l.id.replace(/[^a-zA-Z0-9_-]/g, "-");
          return rawId === safeId || rawId.startsWith(`${safeId}-`);
        });

        if (appLayer && supportsFeatureInteractions(appLayer) && appLayer.interactionConfig?.popupEnabled !== false) {
           const obj = info.object as Record<string, unknown>;
           const properties = (obj.properties as Record<string, unknown>) || obj;
           const html = buildPopupHtml(appLayer, properties);

           const coord = getDeckClickLngLat(map, info, obj);
           if (html && coord) {
             popupRef.current?.remove();
             popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-popup" });
             popupRef.current.setLngLat([coord[0], coord[1]]).setHTML(html).addTo(map);
           }
        }
      },
    });
  }, [settings?.showLayerTooltips, settings?.showLayerPopups]);


  useEffect(() => {
    registerCogProtocol();
    registerPmtilesProtocol();
    registerMbtilesProtocol();
    return () => {
      unregisterCogProtocol();
      unregisterPmtilesProtocol();
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const isDark = detectDarkMode();
    currentThemeRef.current = isDark ? "dark" : "light";
    const initialCenter = defaultProjectionMode === "globe" ? DEFAULT_GLOBE_CENTER : DEFAULT_FLAT_CENTER;
    const initialZoom = defaultProjectionMode === "globe" ? DEFAULT_GLOBE_ZOOM : DEFAULT_FLAT_ZOOM;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getBasemapStyle(selectedBasemapRef.current, isDark),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });
    mapRef.current = map;

    map.once("load", () => {
      applyProjectionMode(map, projectionModeRef.current);
      if (projectionModeRef.current === "globe") {
        fitGlobeToViewport(map, false);
      }
      syncMapLibreLayers(map, userLayersRef.current);
      void syncDeckLayers(map, userLayersRef.current);

      if (settings?.showScaleBar !== false) {
        scaleControlRef.current = new maplibregl.ScaleControl({
          maxWidth: 112,
          unit: "metric",
        });
        map.addControl(scaleControlRef.current, "bottom-left");
      }
    });

    return () => {
      if (scaleControlRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(scaleControlRef.current);
        } catch {
          // Ignore
        }
      }
      scaleControlRef.current = null;
      if (deckOverlayRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(deckOverlayRef.current as unknown as maplibregl.IControl);
        } catch {
          // Ignore
        }
        deckOverlayRef.current.finalize();
        deckOverlayRef.current = null;
      }
      markerRef.current?.remove();
      markerRef.current = null;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      currentThemeRef.current = null;
    };
  }, [applyProjectionMode, defaultProjectionMode, fitGlobeToViewport, syncDeckLayers, syncMapLibreLayers, settings?.showScaleBar]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const onStyleLoad = () => {
      syncMapLibreLayers(map, userLayersRef.current);
      void syncDeckLayers(map, userLayersRef.current);
    };

    map.on("style.load", onStyleLoad);
    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [syncDeckLayers, syncMapLibreLayers]);

  useEffect(() => {
    userLayersRef.current = userLayers;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    syncMapLibreLayers(map, userLayers);
    void syncDeckLayers(map, userLayers);
  }, [syncDeckLayers, syncMapLibreLayers, userLayers]);

  // Interaction handlers for MapLibre layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const findAppLayer = (maplibreLayerId: string) => {
      const layerId = maplibreLayerId.replace(new RegExp(`^${MAPLIBRE_LAYER_PREFIX}(src-)?(.*?)(-fill|-line|-point|-marker|-label|-raster)?$`), "$2");
      return userLayersRef.current.find(l => l.id.replace(/[^a-zA-Z0-9_-]/g, "-") === layerId);
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (settings?.showLayerTooltips === false) {
        deckHoverActiveRef.current = false;
        if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
        clearHoverHighlightFeature(map);
        map.getCanvas().style.cursor = "";
        return;
      }

      if (deckHoverActiveRef.current) {
        return;
      }

      const features = map.queryRenderedFeatures(e.point).filter(f => f.layer.id.startsWith(MAPLIBRE_LAYER_PREFIX));
      
      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        const feature = features[0];
        const appLayer = findAppLayer(feature.layer.id);
        
        if (supportsFeatureInteractions(appLayer) && appLayer?.interactionConfig?.tooltipEnabled !== false) {
          const html = buildTooltipHtml(appLayer, feature.properties);
          if (appLayer?.interactionConfig?.hoverHighlightEnabled !== false) {
            const hoverFeature = mapFeatureToGeoJsonFeature(feature);
            if (hoverFeature) {
              const hoverStyle = buildHoverHighlightStyle(appLayer, hoverFeature.geometry.type);
              setHoverHighlightFeature(map, hoverFeature, hoverStyle);
            } else {
              clearHoverHighlightFeature(map);
            }
          } else {
            clearHoverHighlightFeature(map);
          }
          if (html) {
            if (!tooltipPopupRef.current) {
              tooltipPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-tooltip" });
            }
            tooltipPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
            return;
          }
        }
      } else {
        map.getCanvas().style.cursor = "";
      }
      if (tooltipPopupRef.current) tooltipPopupRef.current.remove();
      clearHoverHighlightFeature(map);
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (settings?.showLayerPopups === false) return;

      const features = map.queryRenderedFeatures(e.point).filter(f => f.layer.id.startsWith(MAPLIBRE_LAYER_PREFIX));
      
      if (features.length > 0) {
        const feature = features[0];
        const appLayer = findAppLayer(feature.layer.id);
        
        if (supportsFeatureInteractions(appLayer) && appLayer?.interactionConfig?.popupEnabled !== false) {
          const html = buildPopupHtml(appLayer, feature.properties);
          if (html) {
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "geoplus-popup" });
            // For polygons, e.lngLat is just where they clicked. For points we could use geometry coordinates, but e.lngLat is reliable.
            popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
          }
        }
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("click", handleClick);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("click", handleClick);
    };
  }, [settings?.showLayerTooltips, settings?.showLayerPopups]);

  useEffect(() => {
    if (!zoomToLayerRequest) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const targetLayer = userLayersRef.current.find((layer) => layer.id === zoomToLayerRequest.layerId);
    if (!targetLayer) {
      setStatusMessage("Layer no longer exists.");
      return;
    }

    const bounds = getLayerLngLatBounds(targetLayer);
    if (!bounds) {
      setStatusMessage("Layer extent is unavailable for zoom.");
      return;
    }

    map.fitBounds(bounds, {
      padding: {
        top: 70,
        right: 70,
        bottom: 70,
        left: 70,
      },
      duration: 560,
      essential: true,
    });
    setStatusMessage(null);
  }, [zoomToLayerRequest]);

  useEffect(() => {
    if (!zoomToFeatureRequest) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const bounds = getGeoJsonLngLatBounds(zoomToFeatureRequest.feature);
    if (!bounds) {
      setStatusMessage("Feature geometry is unavailable for zoom.");
      return;
    }

    map.fitBounds(bounds, {
      padding: {
        top: 56,
        right: 56,
        bottom: 56,
        left: 56,
      },
      duration: 480,
      essential: true,
    });
    setStatusMessage(null);
  }, [zoomToFeatureRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const updateBearing = () => {
      setMapBearing(map.getBearing());
    };

    updateBearing();
    map.on("rotate", updateBearing);
    return () => {
      map.off("rotate", updateBearing);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const updateMapViewMode = () => {
      setMapViewMode(map.getPitch() > 1 ? "3d" : "2d");
    };

    updateMapViewMode();
    map.on("pitch", updateMapViewMode);
    map.on("moveend", updateMapViewMode);
    return () => {
      map.off("pitch", updateMapViewMode);
      map.off("moveend", updateMapViewMode);
    };
  }, []);

  useEffect(() => {
    if (!isSearchPanelOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isSearchPanelOpen]);

  useEffect(() => {
    const nextMode: MapProjectionMode = hasOverlayLayers ? "flat" : "globe";
    if (projectionModeRef.current === nextMode) {
      return;
    }

    projectionModeRef.current = nextMode;
    setMapProjectionMode(nextMode);

    if (mapRef.current) {
      applyProjectionMode(mapRef.current, nextMode);
      if (nextMode === "globe") {
        fitGlobeToViewport(mapRef.current, true);
      }
    }
  }, [hasOverlayLayers, applyProjectionMode, fitGlobeToViewport]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    const root = document.documentElement;
    const updateBasemapFromTheme = () => {
      const isDark = detectDarkMode();
      const nextTheme = isDark ? "dark" : "light";

      if (currentThemeRef.current === nextTheme) {
        return;
      }

      if (!mapRef.current) {
        return;
      }

      setStyleWithProjection(mapRef.current, getBasemapStyle(selectedBasemapRef.current, isDark));
      currentThemeRef.current = nextTheme;
    };

    const observer = new MutationObserver(updateBasemapFromTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
    };
  }, [setStyleWithProjection]);

  useEffect(() => {
    selectedBasemapRef.current = selectedBasemapId;

    const map = mapRef.current;
    if (!map) {
      return;
    }

    setStyleWithProjection(map, getBasemapStyle(selectedBasemapId, detectDarkMode()));
  }, [selectedBasemapId, setStyleWithProjection]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === mapRootRef.current);
      mapRef.current?.resize();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const setMapMarker = useCallback((longitude: number, latitude: number) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!markerRef.current) {
      const markerElement = document.createElement("div");
      markerElement.setAttribute("aria-hidden", "true");
      markerElement.style.width = "16px";
      markerElement.style.height = "16px";
      markerElement.style.borderRadius = "9999px";
      markerElement.style.background = "var(--accent)";
      markerElement.style.border = "2px solid var(--background)";
      markerElement.style.boxShadow = "0 0 0 2px color-mix(in srgb, var(--accent) 60%, transparent), 0 6px 16px rgba(0,0,0,0.35)";

      markerRef.current = new maplibregl.Marker({
        element: markerElement,
        anchor: "center",
      });
    }

    markerRef.current.setLngLat([longitude, latitude]).addTo(map);
  }, []);

  const flyToCoordinates = useCallback((longitude: number, latitude: number, zoom = 13) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.flyTo({
      center: [longitude, latitude],
      zoom,
      essential: true,
      speed: 0.9,
      curve: 1.35,
    });
  }, []);

  const zoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 240 });
  }, []);

  const zoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 240 });
  }, []);

  const resetNavigation = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.easeTo({
      bearing: 0,
      pitch: 0,
      duration: 360,
      essential: true,
    });
    setMapViewMode("2d");
  }, []);

  const setMapMode = useCallback((mode: "2d" | "3d") => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.easeTo({
      pitch: mode === "3d" ? 60 : 0,
      duration: 420,
      essential: true,
    });
    setMapViewMode(mode);
  }, []);

  const toggleProjectionMode = useCallback(() => {
    const nextMode: MapProjectionMode = projectionModeRef.current === "globe" ? "flat" : "globe";
    projectionModeRef.current = nextMode;
    setMapProjectionMode(nextMode);

    const map = mapRef.current;
    if (!map) {
      return;
    }

    applyProjectionMode(map, nextMode);
    if (nextMode === "globe") {
      fitGlobeToViewport(map, true);
    }
  }, [applyProjectionMode, fitGlobeToViewport]);

  const toggleFullscreen = useCallback(async () => {
    if (!mapRootRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === mapRootRef.current) {
        await document.exitFullscreen();
      } else {
        await mapRootRef.current.requestFullscreen();
      }
      setStatusMessage(null);
    } catch {
      setStatusMessage("Fullscreen is unavailable in this browser.");
    }
  }, []);

  const focusSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      const longitude = Number(result.lon);
      const latitude = Number(result.lat);

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        setStatusMessage("Could not locate that search result on the map.");
        return;
      }

      flyToCoordinates(longitude, latitude);
      setMapMarker(longitude, latitude);
      setSearchQuery(result.display_name);
      setSearchResults([]);
      setStatusMessage(null);
    },
    [flyToCoordinates, setMapMarker],
  );

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setStatusMessage("Enter a place or address to search.");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    setStatusMessage(null);

    try {
      const results = await searchNominatimLocations(query, controller.signal);
      if (results.length === 0) {
        setSearchResults([]);
        setStatusMessage("No locations matched that search.");
        return;
      }

      setSearchResults(results);
      focusSearchResult(results[0]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setSearchResults([]);
      setStatusMessage("Search is temporarily unavailable.");
    } finally {
      setIsSearching(false);
    }
  }, [focusSearchResult, searchQuery]);

  const goToCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported in this browser.");
      return;
    }

    setIsLocating(true);
    setStatusMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        flyToCoordinates(longitude, latitude, 14);
        setMapMarker(longitude, latitude);
        setStatusMessage(null);
        setIsLocating(false);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatusMessage("Location permission was denied.");
        } else if (error.code === error.TIMEOUT) {
          setStatusMessage("Timed out while retrieving your location.");
        } else {
          setStatusMessage("Unable to determine your location.");
        }
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    );
  }, [flyToCoordinates, setMapMarker]);

  const toggleSearchPanel = useCallback(() => {
    setIsSearchPanelOpen((open) => !open);
  }, []);

  const toggleLegendPanel = useCallback(() => {
    setIsLegendPanelOpen((open) => !open);
  }, []);

  const toggleAttributionPanel = useCallback(() => {
    setIsAttributionOpen((open) => !open);
  }, []);

  const closeAttributionPanel = useCallback(() => {
    setIsAttributionOpen(false);
  }, []);

  return {
    mapRootRef,
    mapContainerRef,
    searchInputRef,
    isFullscreen,
    isLocating,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isSearchPanelOpen,
    isLegendPanelOpen,
    isAttributionOpen,
    mapViewMode,
    mapProjectionMode,
    statusMessage,
    mapBearing,
    toggleSearchPanel,
    toggleLegendPanel,
    toggleAttributionPanel,
    closeAttributionPanel,
    setMapMode,
    toggleProjectionMode,
    runSearch,
    focusSearchResult,
    zoomIn,
    zoomOut,
    resetNavigation,
    goToCurrentLocation,
    toggleFullscreen,
  };
}
