import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";
import { PMTiles } from "pmtiles";

export const parsePmtilesUpload: UploadFileParser = async (file) => {
  const sourceUrl = URL.createObjectURL(file);
  const pmtiles = new PMTiles(sourceUrl);
  const header = await pmtiles.getHeader();
  const isRaster = header.tileType === 2 || header.tileType === 3 || header.tileType === 4 || header.tileType === 5; // Png, Jpeg, Webp, Avif

  return [
    {
      formatLabel: "PMTiles",
      layerType: isRaster ? "raster-tile" : "mvt",
      sourceUrl,
      readyMessage: `PMTiles archive (${isRaster ? "Raster" : "Vector"}) parsed and ready to add.`,
    }
  ];
};

export const parseMbtilesUpload: UploadFileParser = async (file) => {
  const { loadMbtilesDatabase, getMbtilesMetadata } = await import("@/lib/geoplus/tilesets/mbtiles-maplibre");
  const sourceUrl = URL.createObjectURL(file);
  const db = await loadMbtilesDatabase(sourceUrl, file);
  const metadata = getMbtilesMetadata(db);
  
  const format = metadata.format?.toLowerCase();
  const isRaster = format === "png" || format === "jpg" || format === "jpeg" || format === "webp";

  return [
    {
      formatLabel: "MBTiles",
      layerType: isRaster ? "raster-tile" : "mvt",
      sourceUrl, // Maps to the blob URL, which our mbtiles protocol will intercept
      readyMessage: `MBTiles archive (${isRaster ? "Raster" : "Vector"}) loaded and ready to add.`,
    }
  ];
};
