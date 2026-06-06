import JSZip from "jszip";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { getFileExtension, parseUploadedSpatialFile } from "@/lib/geoplus/upload-parsers";
import { isOpfsUrl, resolveLayerFileUrl } from "@/lib/geoplus/opfs-storage";
import {
  buildDashboardAssetCacheKey,
  readCachedDashboardAsset,
  writeCachedDashboardAsset,
} from "@/lib/geoplus/dashboard-cache-storage";
import { CORE_BACKEND_URL } from "./dashboard-storage";

export function requiresDashboardLayerHydration(layer: GeoPlusLayerItem): boolean {
  return Boolean(
    (
      layer.sourceUrl &&
        (layer.layerType === "geojson" || layer.layerType === "scatterplot") &&
        !layer.inlineData
    ) ||
      (layer.sourceMode === "upload" &&
        (layer.layerType === "geojson" || layer.layerType === "scatterplot") &&
        !layer.inlineData &&
        !layer.originalFile &&
        Boolean(layer.uploadStorageUrl))
  );
}

function buildDashboardLayerFetchUrls(sourceUrl: string): string[] {
  const trimmedSourceUrl = sourceUrl.trim();
  if (!trimmedSourceUrl) {
    return [];
  }

  if (!trimmedSourceUrl.startsWith("http")) {
    return [
      `${CORE_BACKEND_URL}${trimmedSourceUrl.startsWith("/") ? "" : "/"}${trimmedSourceUrl}`,
    ];
  }

  try {
    const parsedUrl = new URL(trimmedSourceUrl);
    const canonicalBackendUrl = new URL(CORE_BACKEND_URL);
    const nextUrls: string[] = [];

    if (parsedUrl.pathname.startsWith("/static/uploads/dashboards/")) {
      const canonicalDatasetUrl = new URL(
        `${parsedUrl.pathname}${parsedUrl.search}`,
        canonicalBackendUrl,
      ).toString();
      nextUrls.push(canonicalDatasetUrl);
    }

    nextUrls.push(parsedUrl.toString());
    return [...new Set(nextUrls)];
  } catch {
    return [trimmedSourceUrl];
  }
}

function getFileNameFromPath(path: string): string {
  const pathname = path.split("?")[0] ?? path;
  return pathname.split("/").pop() || "data";
}

async function restoreHydrationFile(blob: Blob, layer: GeoPlusLayerItem): Promise<File> {
  const downloadedFileName = getFileNameFromPath(layer.sourceUrl ?? "");
  const preferredFileName = layer.fileName || downloadedFileName;
  const downloadedExtension = getFileExtension(downloadedFileName);
  const preferredExtension = getFileExtension(preferredFileName);

  if (downloadedExtension !== ".zip" || preferredExtension === ".zip") {
    return new File([blob], preferredFileName, { type: blob.type });
  }

  const zip = await JSZip.loadAsync(blob);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"));

  const exactMatch = entries.find((entry) => getFileNameFromPath(entry.name) === preferredFileName);
  const extensionMatch = entries.find((entry) => getFileExtension(entry.name) === preferredExtension);
  const selectedEntry = exactMatch ?? extensionMatch ?? (entries.length === 1 ? entries[0] : null);

  if (!selectedEntry) {
    throw new Error(`Saved archive for ${layer.name} did not contain a restorable dataset file.`);
  }

  const restoredBlob = await selectedEntry.async("blob");
  const restoredFileName = getFileNameFromPath(selectedEntry.name) || preferredFileName;
  return new File([restoredBlob], restoredFileName, { type: restoredBlob.type || blob.type });
}

/**
 * Iterates through all layers in a dashboard. If a layer was originally 
 * an upload (now hosted as a URL), we fetch it and parse it back into memory.
 */
export async function hydrateDashboardLayers(
  layers: GeoPlusLayerItem[],
  options: { dashboardId?: string | null } = {},
): Promise<GeoPlusLayerItem[]> {
  return Promise.all(
    layers.map(async (layer) => {
      // Check if it's a layer we need to hydrate into memory
      // (Deck.gl GeoJSON/Scatterplot layers require inlineData, and upload mode was mapped to 'url')
      if (requiresDashboardLayerHydration(layer)) {
        try {
          if (
            layer.sourceMode === "upload" &&
            (layer.layerType === "geojson" || layer.layerType === "scatterplot") &&
            !layer.inlineData &&
            !layer.originalFile
          ) {
            const localUploadUrl =
              layer.uploadStorageUrl ??
              (layer.sourceUrl && isOpfsUrl(layer.sourceUrl) ? layer.sourceUrl : undefined);

            if (localUploadUrl) {
              const localFile = await resolveLayerFileUrl(localUploadUrl);
              if (localFile) {
                const parsed = await parseUploadedSpatialFile(localFile);
                if (!parsed || parsed.length === 0) {
                  throw new Error(`Failed to restore local upload for ${layer.name}`);
                }

                return {
                  ...layer,
                  inlineData: parsed[0].inlineData,
                  rawInlineData: parsed[0].inlineData,
                  originalFile: localFile,
                };
              }
            }
          }

          // 1. Fetch the remote zipped/raw dataset.
          // Prefer the current backend origin for GeoPlus static dashboard files, then fall back
          // to the original stored absolute URL if needed.
          const fetchUrls = buildDashboardLayerFetchUrls(layer.sourceUrl ?? "");
          let blob: Blob | null = null;
          let lastFetchError: Error | null = null;
          const assetCacheKey = layer.sourceUrl
            ? buildDashboardAssetCacheKey(layer.sourceUrl, layer.fileName || layer.id)
            : null;

          if (options.dashboardId && assetCacheKey) {
            const cachedFile = await readCachedDashboardAsset(options.dashboardId, assetCacheKey);
            if (cachedFile) {
              blob = cachedFile;
            }
          }

          if (!blob) {
            for (const fetchUrl of fetchUrls) {
              try {
                const response = await fetch(fetchUrl, {
                  cache: "no-store",
                  credentials: "include",
                });
                if (!response.ok) {
                  throw new Error(`Failed to fetch layer data: ${response.status} ${response.statusText}`);
                }

                // Fast fail if we accidentally get an HTML error page back instead of our zip/binary.
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("text/html")) {
                  throw new Error(
                    `Expected dataset but received HTML from server at ${fetchUrl}. This usually means a 404 or backend routing error.`,
                  );
                }

                blob = await response.blob();
                if (options.dashboardId && assetCacheKey) {
                  void writeCachedDashboardAsset(options.dashboardId, assetCacheKey, blob);
                }
                break;
              } catch (error) {
                lastFetchError =
                  error instanceof Error ? error : new Error("Unknown dashboard layer download failure.");
              }
            }
          }

          if (!blob) {
            throw lastFetchError ?? new Error(`Failed to fetch layer data for ${layer.name}.`);
          }
          
          // 2. Reconstruct a File object for the parser
          // IMPORTANT: We must use the exact original file name (layer.fileName) if available.
          // Loaders.gl and other parsers rely heavily on specific extensions to route to the correct parser.
          // Even if the backend changed the name to a random token (e.g. token.kmz), we should restore 
          // the original name (my-data.kmz) to ensure maximum compatibility.
          const file = await restoreHydrationFile(blob, layer);

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
