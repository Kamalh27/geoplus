import type maplibregl from "maplibre-gl";

import type { GeoPlusLayerItem, GeoPlusLayerType } from "@/components/geoplus/types";
import { resolveTilesetSourceUrl } from "@/lib/geoplus/tilesets/source-url";

type SyncMapLibreTilesetLayerArgs = {
  map: maplibregl.Map;
  layer: GeoPlusLayerItem;
  sourceId: string;
  rasterLayerId: string;
  layerOpacity: number;
};

type MapLibreTilesetScript = (args: SyncMapLibreTilesetLayerArgs) => boolean;

const syncRasterSourceAndLayer = (args: SyncMapLibreTilesetLayerArgs) => {
  const { map, layer, sourceId, rasterLayerId, layerOpacity } = args;
  const sourceUrl = resolveTilesetSourceUrl(layer);
  if (!sourceUrl) {
    return false;
  }

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      tiles: [sourceUrl],
      tileSize: 256,
    });
  }

  if (!map.getLayer(rasterLayerId)) {
    map.addLayer({
      id: rasterLayerId,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": 0.9 * layerOpacity,
      },
    });
  } else {
    map.setPaintProperty(rasterLayerId, "raster-opacity", 0.9 * layerOpacity);
  }

  return true;
};

const MAPLIBRE_TILESET_SCRIPTS: Partial<Record<GeoPlusLayerType, MapLibreTilesetScript>> = {
  "raster-tile": syncRasterSourceAndLayer,
  wms: syncRasterSourceAndLayer,
};

export const syncMapLibreTilesetLayer = (args: SyncMapLibreTilesetLayerArgs) => {
  const script = MAPLIBRE_TILESET_SCRIPTS[args.layer.layerType];
  if (!script) {
    return false;
  }
  return script(args);
};
