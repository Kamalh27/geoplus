import { parseCsvUpload } from "@/lib/geoplus/upload-parsers/csv-upload-parser";
import { parseGeoJsonUpload } from "@/lib/geoplus/upload-parsers/geojson-upload-parser";
import { parseGeoPackageUpload } from "@/lib/geoplus/upload-parsers/geopackage-upload-parser";
import { parseGeoparquetUpload } from "@/lib/geoplus/upload-parsers/geoparquet-upload-parser";
import { parseShapefileUpload } from "@/lib/geoplus/upload-parsers/shapefile-upload-parser";
import { parsePmtilesUpload, parseMbtilesUpload } from "@/lib/geoplus/upload-parsers/pmtiles-upload-parser";
import { parseCogUpload } from "@/lib/geoplus/upload-parsers/cog-upload-parser";
import { parseKmlUpload } from "@/lib/geoplus/upload-parsers/kml-upload-parser";
import { parseZarrUpload } from "@/lib/geoplus/upload-parsers/zarr-upload-parser";
import type { ParsedUploadLayer, UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

export type { ParsedUploadLayer } from "@/lib/geoplus/upload-parsers/types";

const parserByExtension: Record<string, UploadFileParser> = {
  ".geojson": parseGeoJsonUpload,
  ".json": parseGeoJsonUpload,
  ".tilejson": parseGeoJsonUpload,
  ".csv": parseCsvUpload,
  ".tsv": parseCsvUpload,
  ".zip": parseShapefileUpload,
  ".shp": parseShapefileUpload,
  ".gpkg": parseGeoPackageUpload,
  ".geopackage": parseGeoPackageUpload,
  ".parquet": parseGeoparquetUpload,
  ".geoparquet": parseGeoparquetUpload,
  ".pmtiles": parsePmtilesUpload,
  ".mbtiles": parseMbtilesUpload,
  ".cog": parseCogUpload,
  ".tif": parseCogUpload,
  ".tiff": parseCogUpload,
  ".kml": parseKmlUpload,
  ".kmz": parseKmlUpload,
  ".zarr": parseZarrUpload,
};

export const supportedUploadExtensions = Object.keys(parserByExtension);

export const supportedUploadAccept = [
  ...supportedUploadExtensions,
  "application/geo+json",
  "application/json",
  "text/csv",
  "text/tab-separated-values",
  "application/zip",
  "application/x-zip-compressed",
  "application/geopackage+sqlite3",
  "application/octet-stream",
  "image/tiff",
  "application/vnd.google-earth.kml+xml",
  "application/vnd.google-earth.kmz",
].join(",");

export const getFileExtension = (fileName: string) => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? `.${extension}` : "";
};

export const parseUploadedSpatialFile = async (file: File): Promise<ParsedUploadLayer[]> => {
  const fileName = file.name.toLowerCase();
  let extension = getFileExtension(file.name);
  
  if (fileName.endsWith(".zarr.zip")) {
    extension = ".zarr";
  }

  const parser = parserByExtension[extension];

  if (!parser) {
    throw new Error(`Unsupported file type. Upload ${supportedUploadExtensions.join(", ")}.`);
  }

  return parser(file);
};

