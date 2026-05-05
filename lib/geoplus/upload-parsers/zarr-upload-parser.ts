import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";
import * as zarr from "zarrita";
import ZipFileStore from "@zarrita/storage/zip";

export const parseZarrUpload: UploadFileParser = async (file) => {
  try {
    const store = ZipFileStore.fromBlob(file);
    
    // We access the internal info promise to quickly find arrays without needing consolidated metadata
    const info = await (store as any).info;
    if (!info || !info.entries) {
      throw new Error("Invalid or empty ZIP file.");
    }
    
    const arrayPaths = Object.keys(info.entries)
      .filter(k => k.endsWith(".zarray") || k.endsWith("zarr.json"))
      .map(k => k.replace(/\.zarray$/, "").replace(/zarr\.json$/, "").replace(/\/$/, ""));

    if (arrayPaths.length === 0) {
      throw new Error("No Zarr arrays found in the uploaded archive.");
    }

    const primaryVariable = arrayPaths[0]; // Simple fallback to the first array found

    return {
      formatLabel: "Zarr",
      layerType: "raster-tile", // We'll treat Zarr as raster for now using carbonplan zarr-layer
      inlineData: {
        file, // We store the File object so the renderer can create the JSZip store
        variable: primaryVariable,
        variables: arrayPaths,
      },
      readyMessage: `Zarr archive parsed. Found variables: ${arrayPaths.join(", ")}. Ready to add.`,
    };
  } catch (error) {
    throw new Error(`Failed to parse Zarr archive: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};
