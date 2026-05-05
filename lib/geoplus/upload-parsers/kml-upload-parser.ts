import { kml } from "@tmcw/togeojson";
import JSZip from "jszip";

import type { UploadFileParser } from "@/lib/geoplus/upload-parsers/types";

type FeatureCollection = GeoJSON.FeatureCollection;

const inferLayerType = (featureCollection: FeatureCollection) => {
  const hasOnlyPoints = featureCollection.features.every((feature) => feature.geometry?.type === "Point");
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

    const validFeatures = geojson.features.filter((f) => f && f.geometry !== null) as GeoJSON.Feature[];
    
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

  return {
    formatLabel,
    layerType: inferLayerType(featureCollection),
    inlineData: featureCollection,
    readyMessage: `${formatLabel} parsed and ready to add.`,
  };
};
