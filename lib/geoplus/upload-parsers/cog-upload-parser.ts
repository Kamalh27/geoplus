import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

export const parseCogUpload: UploadFileParser = async (file) => {
  const sourceUrl = URL.createObjectURL(file);

  return [
    {
      formatLabel: "COG",
      layerType: "raster-tile",
      sourceUrl,
      readyMessage: "COG (Cloud Optimized GeoTIFF) ready to add.",
    }
  ];
};
