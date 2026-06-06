import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";
import { PMTiles } from "pmtiles";
import { persistUploadFile } from "@/lib/geoplus/opfs-storage";

export const parsePmtilesUpload: UploadFileParser = async (file) => {
  const blobUrl = URL.createObjectURL(file);
  const pmtiles = new PMTiles(blobUrl);
  const header = await pmtiles.getHeader();
  const isRaster = header.tileType === 2 || header.tileType === 3 || header.tileType === 4 || header.tileType === 5; // Png, Jpeg, Webp, Avif

  const persistedUrl = await persistUploadFile("pmtiles", file);

  return [
    {
      formatLabel: "PMTiles",
      layerType: isRaster ? "raster-tile" : "mvt",
      sourceUrl: persistedUrl,
      uploadStorageUrl: persistedUrl,
      readyMessage: `PMTiles archive (${isRaster ? "Raster" : "Vector"}) parsed and ready to add.`,
    }
  ];
};

export const parseMbtilesUpload: UploadFileParser = async (file) => {
  const { loadMbtilesDatabase, getMbtilesMetadata } = await import("@/lib/geoplus/tilesets/mbtiles-maplibre");
  const persistedUrl = await persistUploadFile("mbtiles", file);
  const db = await loadMbtilesDatabase(persistedUrl, file);
  const metadata = getMbtilesMetadata(db);

  const format = metadata.format?.toLowerCase();
  const isRaster = format === "png" || format === "jpg" || format === "jpeg" || format === "webp";

  return [
    {
      formatLabel: "MBTiles",
      layerType: isRaster ? "raster-tile" : "mvt",
      sourceUrl: persistedUrl,
      uploadStorageUrl: persistedUrl,
      readyMessage: `MBTiles archive (${isRaster ? "Raster" : "Vector"}) loaded and ready to add.`,
    }
  ];
};
