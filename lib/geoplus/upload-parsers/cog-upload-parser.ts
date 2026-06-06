import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";
import { persistUploadFile } from "@/lib/geoplus/opfs-storage";

export const parseCogUpload: UploadFileParser = async (file) => {
  const sourceUrl = await persistUploadFile("cog", file);

  return [
    {
      formatLabel: "COG",
      layerType: "raster-tile",
      sourceUrl,
      uploadStorageUrl: sourceUrl,
      readyMessage: "COG (Cloud Optimized GeoTIFF) ready to add.",
    }
  ];
};
