import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { parseUploadedSpatialFile } from "@/lib/geoplus/upload-parsers";
import { CORE_BACKEND_URL } from "./dashboard-storage";

/**
 * Iterates through all layers in a dashboard. If a layer was originally 
 * an upload (now hosted as a URL), we fetch it and parse it back into memory.
 */
export async function hydrateDashboardLayers(
  layers: GeoPlusLayerItem[]
): Promise<GeoPlusLayerItem[]> {
  return Promise.all(
    layers.map(async (layer) => {
      // Check if it's a layer we need to hydrate into memory
      // (Deck.gl GeoJSON/Scatterplot layers require inlineData, and upload mode was mapped to 'url')
      if (
        layer.sourceUrl && 
        (layer.layerType === "geojson" || layer.layerType === "scatterplot") &&
        !layer.inlineData 
      ) {
        try {
          // 1. Fetch the remote zipped/raw dataset
          // The backend now provides absolute URLs (http://localhost:8000/...), 
          // but we keep the fallback for any old metadata files that only have relative paths.
          const fetchUrl = layer.sourceUrl.startsWith('http') 
            ? layer.sourceUrl 
            : `${CORE_BACKEND_URL}${layer.sourceUrl.startsWith('/') ? '' : '/'}${layer.sourceUrl}`;
            
          const response = await fetch(fetchUrl);
          if (!response.ok) throw new Error(`Failed to fetch layer data: ${response.status} ${response.statusText}`);
          
          // Fast fail if we accidentally get an HTML error page back instead of our zip/binary
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("text/html")) {
             throw new Error(`Expected dataset but received HTML from server at ${fetchUrl}. This usually means a 404 or backend routing error.`);
          }
          
          const blob = await response.blob();
          
          // 2. Reconstruct a File object for the parser
          // IMPORTANT: We must use the exact original file name (layer.fileName) if available.
          // Loaders.gl and other parsers rely heavily on specific extensions to route to the correct parser.
          // Even if the backend changed the name to a random token (e.g. token.kmz), we should restore 
          // the original name (my-data.kmz) to ensure maximum compatibility.
          const urlFileName = layer.sourceUrl.split('/').pop() || 'data.zip';
          const originalName = layer.fileName || urlFileName;
          
          const file = new File([blob], originalName, { type: blob.type });

          // 3. Run it back through our exact upload parsing logic
          const parsed = await parseUploadedSpatialFile(file);

          if (!parsed || parsed.length === 0) {
            throw new Error(`Failed to restore layer data for ${layer.name}`);
          }

          // 4. Return the fully hydrated layer (assuming single layer extraction for simplicity here)
          return {
            ...layer,
            inlineData: parsed[0].inlineData,
            rawInlineData: parsed[0].inlineData,
            // Re-attach originalFile in case they want to save it again!
            originalFile: file 
          };
        } catch (error) {
          console.error(`Failed to hydrate layer ${layer.name}:`, error);
          // Return the broken layer so it shows up in the UI, but remove the sourceUrl 
          // so Deck.gl doesn't try to naively fetch it and crash with "No valid loader found".
          return {
             ...layer,
             sourceUrl: undefined,
             duckDbError: "Failed to download and parse layer data from server."
          };
        }
      }

      // For standard Service layers (WMS/MVT/Tiles), no fetching is needed
      return layer;
    })
  );
}
