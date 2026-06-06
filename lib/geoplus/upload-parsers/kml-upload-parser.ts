import { kml } from "@tmcw/togeojson";
import JSZip from "jszip";

import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";
import { persistUploadFile } from "@/lib/geoplus/opfs-storage";

type FeatureCollection = GeoJSON.FeatureCollection;

const inferLayerType = (featureCollection: FeatureCollection) => {
  // Use scatterplot only when ALL features are Point geometry. Any mix that
  // includes LineStrings, Polygons, or MultiGeometry must use the full
  // GeoJsonLayer so all geometry types are rendered correctly.
  const hasOnlyPoints = featureCollection.features.every(
    (feature) => feature.geometry?.type === "Point" || feature.geometry?.type === "MultiPoint",
  );
  return hasOnlyPoints ? "scatterplot" : "geojson";
};

const parseKmlString = (kmlString: string): FeatureCollection => {
  if (!kmlString || !kmlString.trim()) {
    throw new Error("KML file is empty.");
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlString, "text/xml");

  const errors = xmlDoc.getElementsByTagName("parsererror");
  if (errors.length > 0) {
    const errorText = errors[0].textContent || "Unknown XML parsing error";
    throw new Error(`Invalid KML file. XML parsing failed: ${errorText}`);
  }

  try {
    const geojson = kml(xmlDoc);
    if (!geojson || geojson.type !== "FeatureCollection") {
      throw new Error("KML file did not contain a valid FeatureCollection.");
    }

    // Filter out features with null, undefined, or geometry-less entries.
    // Also reject features whose geometry has no coordinates (empty arrays
    // can crash deck.gl's triangulation and produce blank rendering).
    const validFeatures = geojson.features.filter((f): f is GeoJSON.Feature => {
      if (!f || f.geometry == null) return false;
      const g = f.geometry as unknown as Record<string, unknown>;
      if (typeof g.type !== "string") return false;
      // GeometryCollection: require at least one sub-geometry
      if (g.type === "GeometryCollection") {
        return Array.isArray(g.geometries) && (g.geometries as unknown[]).length > 0;
      }
      // All other types: require a non-empty coordinates array
      if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
      return true;
    });

    return {
      type: "FeatureCollection",
      features: validFeatures,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Conversion to GeoJSON failed.";
    throw new Error(`Failed to convert KML to GeoJSON: ${message}`);
  }
};

export const parseKmlUpload: UploadFileParser = async (file) => {
  const fileName = file.name.toLowerCase();
  const uploadStorageUrl = await persistUploadFile("kml", file);
  let kmlContent: string;

  if (fileName.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
    if (!kmlFile) {
      throw new Error("KMZ file does not contain a KML file.");
    }
    kmlContent = await kmlFile.async("string");
  } else {
    kmlContent = await file.text();
  }

  const featureCollection = parseKmlString(kmlContent);

  if (featureCollection.features.length === 0) {
    throw new Error("No valid spatial features found in KML/KMZ.");
  }

  const formatLabel = fileName.endsWith(".kmz") ? "KMZ" : "KML";

  return [
    {
      formatLabel,
      layerType: inferLayerType(featureCollection),
      inlineData: featureCollection,
      uploadStorageUrl,
      featureCountEstimate: featureCollection.features.length,
      readyMessage: `${formatLabel} parsed and ready to add.`,
    }
  ];
};
