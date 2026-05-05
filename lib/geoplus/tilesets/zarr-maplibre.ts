import maplibregl from "maplibre-gl";
import { ZarrLayer } from "@carbonplan/zarr-layer";
import JSZip from "jszip";
import { JSZipStore } from "./jszip-zarr-store";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";

const ZARR_LAYER_PREFIX = "geoplus-user-zarr-";
const toSafeLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getZarrManagedIds = (layerId: string) => {
  const safeId = toSafeLayerId(layerId);
  return {
    layerId: `${ZARR_LAYER_PREFIX}${safeId}-raster`,
  };
};

export const isZarrMapLibreLayer = (layer: GeoPlusLayerItem) => {
  const data = layer.inlineData as Record<string, unknown> | undefined;
  return layer.engine === "maplibre" && data && typeof data.variable === "string" && data.file instanceof File;
};

const zarrZipCache = new WeakMap<File, JSZip>();

export const syncZarrMapLibreLayer = async (args: {
  map: maplibregl.Map;
  layer: GeoPlusLayerItem;
  layerOpacity: number;
}) => {
  const { map, layer, layerOpacity } = args;
  const data = layer.inlineData as { file: File; variable: string; variables: string[] };
  if (!data || !data.file || !map.isStyleLoaded()) {
    return;
  }

  const { layerId } = getZarrManagedIds(layer.id);

  if (map.getLayer(layerId)) {
    return;
  }

  try {
    let zip = zarrZipCache.get(data.file);
    if (!zip) {
      zip = await JSZip.loadAsync(await data.file.arrayBuffer());
      zarrZipCache.set(data.file, zip);
    }

    const store = new JSZipStore(zip);

    const zarrLayer = new ZarrLayer({
      id: layerId,
      store: store as any,
      variable: data.variable,
      opacity: layerOpacity,
      colormap: ["#440154", "#3b528b", "#21908d", "#5dc963", "#fde725"],
      clim: [0, 100],
    });

    map.addLayer(zarrLayer as any);
  } catch (error) {
    console.error(`Failed to sync Zarr layer ${layer.name}:`, error);
  }
};
