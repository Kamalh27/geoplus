import type { GeoPlusLayerItem } from "@/components/geoplus/types";

export const buildWmsTemplateUrl = (sourceUrl: string) => {
  if (sourceUrl.includes("{bbox-epsg-3857}")) {
    return sourceUrl;
  }
  const separator = sourceUrl.includes("?") ? "&" : "?";
  return `${sourceUrl}${separator}service=WMS&request=GetMap&styles=&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256`;
};

export const resolveTilesetSourceUrl = (layer: GeoPlusLayerItem) => {
  if (!layer.sourceUrl) {
    return null;
  }
  if (layer.layerType === "wms") {
    return buildWmsTemplateUrl(layer.sourceUrl);
  }
  return layer.sourceUrl;
};
