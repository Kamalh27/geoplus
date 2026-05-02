import maplibregl from "maplibre-gl";

export type GeoPlusBasemapId =
  | "dark"
  | "light"
  | "satellite"
  | "osm"
  | "terrain"
  | "none";

export type GeoPlusBasemapOption = {
  id: GeoPlusBasemapId;
  label: string;
  previewImage: string;
};

export type GeoPlusAttributionLine = {
  text: string;
  href?: string;
};

export const DEFAULT_GLOBE_BASEMAP_ID: GeoPlusBasemapId = "satellite";

const CARTO_ATTRIBUTION = "© OpenStreetMap contributors © CARTO";
const ESRI_SATELLITE_ATTRIBUTION = "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const ESRI_TOPO_ATTRIBUTION = "Sources: Esri, USGS, NOAA";

const CARTO_LIGHT_TILE_URL = "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
const CARTO_DARK_TILE_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const ESRI_SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_TOPO_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";

export const GEOPLUS_BASEMAP_OPTIONS: GeoPlusBasemapOption[] = [
  { id: "dark", label: "Dark", previewImage: "https://a.basemaps.cartocdn.com/dark_all/4/8/5.png" },
  { id: "light", label: "Light", previewImage: "https://a.basemaps.cartocdn.com/light_all/4/8/5.png" },
  { id: "satellite", label: "Satellite", previewImage: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/8" },
  { id: "osm", label: "OSM", previewImage: "https://tile.openstreetmap.org/4/8/5.png" },
  { id: "terrain", label: "Terrain", previewImage: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/4/5/8" },
  {
    id: "none",
    label: "No Basemap",
    previewImage:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90' viewBox='0 0 160 90'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23020317'/%3E%3Cstop offset='1' stop-color='%230f172a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='160' height='90' fill='url(%23g)'/%3E%3Cpath d='M0 22h160M0 45h160M0 68h160M32 0v90M64 0v90M96 0v90M128 0v90' stroke='%231e293b' stroke-width='1'/%3E%3C/svg%3E",
  },
];

function createSingleRasterStyle(options: {
  sourceId: string;
  layerId: string;
  tiles: string[];
  attribution: string;
  minzoom?: number;
  maxzoom?: number;
}): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      [options.sourceId]: {
        type: "raster",
        tiles: options.tiles,
        tileSize: 256,
        maxzoom: 22,
        attribution: options.attribution,
      },
    },
    layers: [
      {
        id: options.layerId,
        type: "raster",
        source: options.sourceId,
        minzoom: options.minzoom ?? 0,
        maxzoom: options.maxzoom ?? 22,
      },
    ],
  };
}

export function getBasemapStyle(basemapId: GeoPlusBasemapId, isDarkTheme: boolean): maplibregl.StyleSpecification {
  switch (basemapId) {
    case "dark":
      return createSingleRasterStyle({
        sourceId: "carto-dark",
        layerId: "carto-dark-layer",
        tiles: [CARTO_DARK_TILE_URL],
        attribution: CARTO_ATTRIBUTION,
      });
    case "light":
      return createSingleRasterStyle({
        sourceId: "carto-light",
        layerId: "carto-light-layer",
        tiles: [CARTO_LIGHT_TILE_URL],
        attribution: CARTO_ATTRIBUTION,
      });
    case "satellite":
      return createSingleRasterStyle({
        sourceId: "esri-satellite",
        layerId: "esri-satellite-layer",
        tiles: [ESRI_SATELLITE_TILE_URL],
        attribution: ESRI_SATELLITE_ATTRIBUTION,
        maxzoom: 20,
      });
    case "osm":
      return createSingleRasterStyle({
        sourceId: "osm-standard",
        layerId: "osm-standard-layer",
        tiles: [OSM_TILE_URL],
        attribution: OSM_ATTRIBUTION,
      });
    case "terrain":
      return createSingleRasterStyle({
        sourceId: "esri-topo",
        layerId: "esri-topo-layer",
        tiles: [ESRI_TOPO_TILE_URL],
        attribution: ESRI_TOPO_ATTRIBUTION,
        maxzoom: 19,
      });
    case "none":
      return {
        version: 8,
        sources: {},
        layers: [
          {
            id: "empty-background",
            type: "background",
            paint: {
              "background-color": isDarkTheme ? "#020617" : "#f1f5f9",
            },
          },
        ],
      };
    default:
      return createSingleRasterStyle({
        sourceId: "esri-satellite-fallback",
        layerId: "esri-satellite-fallback-layer",
        tiles: [ESRI_SATELLITE_TILE_URL],
        attribution: ESRI_SATELLITE_ATTRIBUTION,
        maxzoom: 20,
      });
  }
}

export function getBasemapAttributionLines(basemapId: GeoPlusBasemapId): GeoPlusAttributionLine[] {
  if (basemapId === "none") {
    return [{ text: "No basemap selected." }];
  }

  if (basemapId === "satellite") {
    return [
      { text: "Imagery © Esri", href: "https://www.esri.com" },
    ];
  }

  if (basemapId === "terrain") {
    return [
      { text: "Topo map © Esri", href: "https://www.esri.com" },
    ];
  }

  if (basemapId === "osm") {
    return [{ text: "Map data © OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" }];
  }

  return [
    { text: "Map data © OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
    { text: "Basemap © CARTO", href: "https://carto.com/attributions" },
  ];
}

export function detectDarkMode() {
  return document.documentElement.classList.contains("dark");
}
