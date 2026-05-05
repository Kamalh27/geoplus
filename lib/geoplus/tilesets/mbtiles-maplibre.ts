import maplibregl from "maplibre-gl";
import initSqlJs, { Database } from "sql.js";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";

const MBTILES_PROTOCOL_NAME = "mbtiles";
const MBTILES_LAYER_PREFIX = "geoplus-user-mbtiles-";
let protocolRegistered = false;
let sqlJsPromise: Promise<any> | null = null;
const activeDatabases = new Map<string, Database>();

type LayerStyleColors = {
  fill: [number, number, number];
  line: [number, number, number];
  point: [number, number, number];
};

const toSafeLayerId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const getMbtilesManagedIds = (layerId: string) => {
  const safeId = toSafeLayerId(layerId);
  return {
    sourceId: `${MBTILES_LAYER_PREFIX}src-${safeId}`,
    layerPrefix: `${MBTILES_LAYER_PREFIX}${safeId}`,
  };
};

const ensureSqlJs = () => {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => `/${file}`,
    });
  }
  return sqlJsPromise;
};

export const registerMbtilesProtocol = () => {
  if (protocolRegistered) {
    return;
  }

  maplibregl.addProtocol(MBTILES_PROTOCOL_NAME, async (params) => {
    // Expected URL format: mbtiles://<blob-url-encoded>/{z}/{x}/{y}
    const urlParts = params.url.replace(`${MBTILES_PROTOCOL_NAME}://`, "").split("/");
    if (urlParts.length < 4) {
      throw new Error("Invalid MBTiles URL format.");
    }

    const yStr = urlParts.pop()?.split(".")[0];
    const xStr = urlParts.pop();
    const zStr = urlParts.pop();
    const encodedBlobUrl = urlParts.join("/");
    const blobUrl = decodeURIComponent(encodedBlobUrl);

    const z = parseInt(zStr || "0", 10);
    const x = parseInt(xStr || "0", 10);
    const y = parseInt(yStr || "0", 10);
    
    const tmsY = Math.pow(2, z) - 1 - y;

    const db = activeDatabases.get(blobUrl);
    
    if (!db) {
      throw new Error("MBTiles database not loaded or found.");
    }

    const stmt = db.prepare("SELECT tile_data FROM tiles WHERE zoom_level = :z AND tile_column = :x AND tile_row = :y");
    if (stmt.step()) {
      const row = stmt.getAsObject({ ":z": z, ":x": x, ":y": tmsY });
      stmt.free();
      if (row.tile_data) {
        return { data: row.tile_data as Uint8Array | ArrayBuffer };
      }
    }
    stmt.free();
    throw new Error("Tile not found");
  });

  protocolRegistered = true;
};

export const loadMbtilesDatabase = async (blobUrl: string, file: File): Promise<Database> => {
  const SQL = await ensureSqlJs();
  const buffer = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));
  activeDatabases.set(blobUrl, db);
  return db;
};

export const getMbtilesMetadata = (db: Database) => {
  const metadata: Record<string, string> = {};
  try {
    const stmt = db.prepare("SELECT name, value FROM metadata");
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.name && row.value) {
        metadata[row.name.toString()] = row.value.toString();
      }
    }
    stmt.free();
  } catch (e) {
    console.warn("Could not read MBTiles metadata table", e);
  }
  return metadata;
};

export const cleanupMbtilesDatabase = (blobUrl: string) => {
  const db = activeDatabases.get(blobUrl);
  if (db) {
    db.close();
    activeDatabases.delete(blobUrl);
  }
};

export const isMbtilesMapLibreLayer = (layer: Pick<GeoPlusLayerItem, "engine" | "serviceType">) =>
  layer.engine === "maplibre" && layer.serviceType === ("mbtiles" as unknown);

export const syncMbtilesMapLibreLayer = async (args: {
  map: maplibregl.Map;
  layer: GeoPlusLayerItem;
  layerOpacity: number;
  styleColors: LayerStyleColors;
}) => {
  const { map, layer, layerOpacity, styleColors } = args;
  const sourceUrl = layer.sourceUrl?.trim();
  if (!sourceUrl) {
    return;
  }

  const { sourceId, layerPrefix } = getMbtilesManagedIds(layer.id);
  const db = activeDatabases.get(sourceUrl);
  if (!db) {
    console.warn(`MBTiles database not found for url: ${sourceUrl}`);
    return;
  }

  const metadata = getMbtilesMetadata(db);
  const isRaster = metadata.format?.toLowerCase() === "png" || metadata.format?.toLowerCase() === "jpg" || metadata.format?.toLowerCase() === "jpeg" || metadata.format?.toLowerCase() === "webp";
  
  const minzoom = metadata.minzoom ? parseInt(metadata.minzoom, 10) : 0;
  const maxzoom = metadata.maxzoom ? parseInt(metadata.maxzoom, 10) : 22;
  const boundsParts = metadata.bounds ? metadata.bounds.split(",").map(Number) : undefined;
  const bounds = boundsParts && boundsParts.length === 4 && boundsParts.every(Number.isFinite) 
    ? boundsParts as [number, number, number, number] 
    : undefined;

  const protocolUrl = `${MBTILES_PROTOCOL_NAME}://${encodeURIComponent(sourceUrl)}/{z}/{x}/{y}`;

  if (!map.isStyleLoaded()) {
    return;
  }

  if (isRaster) {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [protocolUrl],
        bounds,
        minzoom,
        maxzoom,
        tileSize: 256,
      });
    }

    const layerId = `${layerPrefix}-raster`;
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": layerOpacity,
        },
      });
    }
    return;
  }

  // Vector Layer
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "vector",
      tiles: [protocolUrl],
      bounds,
      minzoom,
      maxzoom,
    });
  }

  let vectorLayers: Array<{ id: string }> = [];
  if (metadata.json) {
    try {
      const parsedJson = JSON.parse(metadata.json);
      if (Array.isArray(parsedJson.vector_layers)) {
        vectorLayers = parsedJson.vector_layers;
      }
    } catch (e) {
      console.warn("Failed to parse MBTiles metadata.json", e);
    }
  }

  const sourceLayerIds = vectorLayers.map(l => l.id).filter(Boolean);
  if (sourceLayerIds.length === 0) {
    console.warn("No vector layers found in MBTiles metadata");
    return;
  }

  for (const sourceLayerId of sourceLayerIds) {
    const safeSourceLayerId = toSafeLayerId(sourceLayerId);
    
    const fillId = `${layerPrefix}-${safeSourceLayerId}-fill`;
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        "source-layer": sourceLayerId,
        paint: {
          "fill-color": `rgb(${styleColors.fill[0]}, ${styleColors.fill[1]}, ${styleColors.fill[2]})`,
          "fill-opacity": 0.18 * layerOpacity,
        },
      });
    }

    const lineId = `${layerPrefix}-${safeSourceLayerId}-line`;
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayerId,
        paint: {
          "line-color": `rgb(${styleColors.line[0]}, ${styleColors.line[1]}, ${styleColors.line[2]})`,
          "line-width": 1.6,
          "line-opacity": 0.9 * layerOpacity,
        },
      });
    }

    const circleId = `${layerPrefix}-${safeSourceLayerId}-circle`;
    if (!map.getLayer(circleId)) {
      map.addLayer({
        id: circleId,
        type: "circle",
        source: sourceId,
        "source-layer": sourceLayerId,
        paint: {
          "circle-radius": 3.5,
          "circle-color": `rgb(${styleColors.point[0]}, ${styleColors.point[1]}, ${styleColors.point[2]})`,
          "circle-opacity": layerOpacity,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }
};
