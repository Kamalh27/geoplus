import type { Layer as DeckLayer } from "@deck.gl/core";
import { BitmapLayer } from "@deck.gl/layers";
import { MVTLayer, TileLayer } from "@deck.gl/geo-layers";
import { MVTLoader } from "@loaders.gl/mvt";
import type { Feature, Geometry } from "geojson";

import type { GeoPlusLayerItem, GeoPlusLayerType } from "@/components/geoplus/types";
import { resolveTilesetSourceUrl } from "@/lib/geoplus/tilesets/source-url";

type LayerStyleColors = {
  fill: [number, number, number];
  line: [number, number, number];
};

type BuildDeckTileLayerArgs = {
  layer: GeoPlusLayerItem;
  layerId: string;
  layerOpacity: number;
  styleColors: LayerStyleColors;
};

type DeckTileLayerScript = (args: BuildDeckTileLayerArgs) => DeckLayer | null;

type MvtFeatureProperties = {
  name?: string;
  rank?: number;
  layerName?: string;
  class?: string;
};

type TileBounds = [number, number, number, number];

type TileBoundsLike = {
  boundingBox?: number[][];
  bbox?: { west: number; south: number; east: number; north: number };
};

const getTileLayerMaxZoom = (sourceUrl: string) => {
  const levelMatch = sourceUrl.match(/Level(\d+)/i);
  if (!levelMatch) {
    return 22;
  }

  const value = Number(levelMatch[1]);
  return Number.isFinite(value) ? value : 22;
};

const fetchTileImage = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, {
    mode: "cors",
    credentials: "omit",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Tile request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  return await createImageBitmap(blob);
};

const getBitmapBounds = (tile: TileBoundsLike | undefined): TileBounds => {
  const boundingBox = tile?.boundingBox;
  if (
    Array.isArray(boundingBox) &&
    boundingBox.length === 2 &&
    Array.isArray(boundingBox[0]) &&
    boundingBox[0].length >= 2 &&
    Array.isArray(boundingBox[1]) &&
    boundingBox[1].length >= 2
  ) {
    return [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]];
  }

  const bbox = tile?.bbox;
  if (bbox) {
    return [bbox.west, bbox.south, bbox.east, bbox.north];
  }

  return [-180, -85, 180, 85];
};

const buildBitmapTileLayer = (id: string, data: string, opacity: number) =>
  new TileLayer({
    id,
    data,
    opacity,
    tileSize: 256,
    minZoom: 0,
    maxZoom: getTileLayerMaxZoom(data),
    getTileData: async ({ signal, url }) => {
      if (!url) {
        return null;
      }

      return await fetchTileImage(url, signal);
    },
    renderSubLayers: (props) => {
      const { data: image, ...bitmapProps } = props;
      return new BitmapLayer(bitmapProps, {
        image,
        bounds: getBitmapBounds((props as { tile?: TileBoundsLike }).tile),
      });
    },
  });

const getWmsLayerNames = (sourceUrl: string) => {
  try {
    const parsedUrl = new URL(sourceUrl);
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      if (key.toLowerCase() === "layers") {
        return value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
  } catch {
    // If URL parsing fails, we will return an empty layer list.
  }

  return [];
};

const getWmsBaseServiceUrl = (sourceUrl: string) => {
  try {
    const parsedUrl = new URL(sourceUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return sourceUrl.split("?")[0] ?? sourceUrl;
  }
};

const getWmsGetMapUrl = (args: {
  sourceUrl: string;
  layers: string[];
  bbox: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
}) => {
  const { sourceUrl, layers, bbox, width, height } = args;
  const params = new URLSearchParams();

  params.set("service", "WMS");
  params.set("request", "GetMap");
  params.set("version", "1.1.1");
  params.set("srs", "EPSG:4326");
  params.set("bbox", [bbox.west, bbox.south, bbox.east, bbox.north].join(","));
  params.set("width", String(width));
  params.set("height", String(height));
  params.set("layers", layers.join(","));
  params.set("styles", "");
  params.set("format", "image/png");
  params.set("transparent", "true");

  return `${getWmsBaseServiceUrl(sourceUrl)}?${params.toString()}`;
};

const mvtScript: DeckTileLayerScript = ({ layer, layerId, layerOpacity }) => {
  const sourceUrl = resolveTilesetSourceUrl(layer);
  if (!sourceUrl) {
    return null;
  }

  const loadOptions = {
    worker: false,
    core: {
      worker: false,
    },
  };

  return new MVTLayer<MvtFeatureProperties>({
    id: layerId,
    data: [sourceUrl],
    loaders: [MVTLoader],
    minZoom: 0,
    maxZoom: 14,
    binary: false,
    loadOptions,
    opacity: layerOpacity,
    getFillColor: (feature: Feature<Geometry, MvtFeatureProperties>) => {
      switch (feature.properties.layerName) {
        case "poi":
          return [255, 0, 0];
        case "water":
          return [120, 150, 180];
        case "building":
          return [218, 218, 218];
        default:
          return [240, 240, 240];
      }
    },
    getLineWidth: (feature: Feature<Geometry, MvtFeatureProperties>) => {
      switch (feature.properties.class) {
        case "street":
          return 6;
        case "motorway":
          return 10;
        default:
          return 1;
      }
    },
    getLineColor: [192, 192, 192],
    getPointRadius: 2,
    pointRadiusUnits: "pixels",
    stroked: false,
    pickable: true,
  });
};

const rasterScript: DeckTileLayerScript = ({ layer, layerId, layerOpacity }) => {
  const sourceUrl = resolveTilesetSourceUrl(layer);
  if (!sourceUrl) {
    return null;
  }
  return buildBitmapTileLayer(layerId, sourceUrl, layerOpacity);
};

const wmsScript: DeckTileLayerScript = ({ layer, layerId, layerOpacity }) => {
  const sourceUrl = layer.sourceUrl?.trim();
  if (!sourceUrl) {
    return null;
  }

  const layerNames = getWmsLayerNames(sourceUrl);
  if (layerNames.length === 0) {
    return null;
  }

  return new TileLayer({
    id: layerId,
    opacity: layerOpacity,
    tileSize: 256,
    minZoom: 0,
    maxZoom: getTileLayerMaxZoom(sourceUrl),
    getTileData: async ({ bbox, signal }) => {
      if (!("west" in bbox)) {
        return null;
      }

      const url = getWmsGetMapUrl({
        sourceUrl,
        layers: layerNames,
        bbox: {
          west: bbox.west,
          south: bbox.south,
          east: bbox.east,
          north: bbox.north,
        },
        width: 256,
        height: 256,
      });

      return await fetchTileImage(url, signal);
    },
    renderSubLayers: (props) => {
      const { data: image, ...bitmapProps } = props;
      const tile = props.tile as {
        bbox: { west: number; south: number; east: number; north: number };
      };

      return new BitmapLayer(bitmapProps, {
        image,
        bounds: [tile.bbox.west, tile.bbox.south, tile.bbox.east, tile.bbox.north],
      });
    },
  });
};

const DECK_TILE_LAYER_SCRIPTS: Partial<Record<GeoPlusLayerType, DeckTileLayerScript>> = {
  mvt: mvtScript,
  "raster-tile": rasterScript,
  wms: wmsScript,
};

export const buildDeckTilesetLayer = (args: BuildDeckTileLayerArgs): DeckLayer | null => {
  const script = DECK_TILE_LAYER_SCRIPTS[args.layer.layerType];
  if (!script) {
    return null;
  }
  return script(args);
};
