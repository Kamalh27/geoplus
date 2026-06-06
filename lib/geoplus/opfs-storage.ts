/**
 * OPFS Storage — Origin Private File System helpers for GeoPLUS.
 *
 * Provides a persistent, origin-isolated file store in the browser so large
 * uploaded files (PMTiles, MBTiles, COG/GeoTIFF, Zarr) survive page reloads
 * and are served without expiring blob: URLs.
 *
 * Layout inside OPFS:
 *   /geoplus/layers/<key>   — one file per uploaded layer
 *
 * A MapLibre custom protocol "opfs://<key>" is registered so tile renderers
 * can request byte ranges directly from OPFS via standard HTTP Range semantics.
 */

import maplibregl from "maplibre-gl";

// ─── Constants ───────────────────────────────────────────────────────────────

const OPFS_PROTOCOL = "opfs";

let protocolRegistered = false;

// ─── Feature detection ───────────────────────────────────────────────────────

export const isOpfsAvailable = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      "storage" in navigator &&
      typeof navigator.storage.getDirectory === "function"
    );
  } catch {
    return false;
  }
};

// ─── Directory helpers ────────────────────────────────────────────────────────

const getOpfsLayerDir = async (): Promise<FileSystemDirectoryHandle> => {
  const root = await navigator.storage.getDirectory();
  const geoplus = await root.getDirectoryHandle("geoplus", { create: true });
  return geoplus.getDirectoryHandle("layers", { create: true });
};

// ─── Store / retrieve / delete ────────────────────────────────────────────────

/**
 * Store a File in OPFS under the given key.
 * Returns the opfs:// URL that can be used to access the file.
 */
export const storeFileInOpfs = async (key: string, file: File): Promise<string> => {
  if (!isOpfsAvailable()) {
    throw new Error("OPFS is not available in this browser.");
  }

  const dir = await getOpfsLayerDir();
  const fileHandle = await dir.getFileHandle(key, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(file);
    await writable.close();
  } catch (err) {
    await writable.abort();
    throw err;
  }

  return `${OPFS_PROTOCOL}://${key}`;
};

/**
 * Retrieve a file from OPFS by key.
 * Returns null if the key does not exist.
 */
export const getFileFromOpfs = async (key: string): Promise<File | null> => {
  if (!isOpfsAvailable()) return null;

  try {
    const dir = await getOpfsLayerDir();
    const fileHandle = await dir.getFileHandle(key);
    return fileHandle.getFile();
  } catch {
    return null;
  }
};

/**
 * Delete a file from OPFS by key. Silently ignores missing keys.
 */
export const deleteFileFromOpfs = async (key: string): Promise<void> => {
  if (!isOpfsAvailable()) return;

  try {
    const dir = await getOpfsLayerDir();
    await dir.removeEntry(key);
  } catch {
    // Not found — ignore
  }
};

/**
 * List all keys currently stored under the layer directory.
 */
export const listOpfsKeys = async (): Promise<string[]> => {
  if (!isOpfsAvailable()) return [];

  try {
    const dir = await getOpfsLayerDir();
    const keys: string[] = [];
    for await (const [name] of dir.entries()) {
      keys.push(name);
    }
    return keys;
  } catch {
    return [];
  }
};

/**
 * Check whether a key exists in OPFS.
 */
export const opfsKeyExists = async (key: string): Promise<boolean> => {
  if (!isOpfsAvailable()) return false;

  try {
    const dir = await getOpfsLayerDir();
    await dir.getFileHandle(key);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get the total size (bytes) of all files stored in the layer directory.
 */
export const getOpfsStorageUsed = async (): Promise<number> => {
  if (!isOpfsAvailable()) return 0;

  try {
    const dir = await getOpfsLayerDir();
    let total = 0;
    for await (const [, handle] of dir.entries()) {
      if (handle.kind === "file") {
        const file = await (handle as FileSystemFileHandle).getFile();
        total += file.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
};

// ─── opfs:// URL helpers ──────────────────────────────────────────────────────

export const isOpfsUrl = (url: string): boolean =>
  url.startsWith(`${OPFS_PROTOCOL}://`);

export const opfsUrlToKey = (url: string): string =>
  url.slice(`${OPFS_PROTOCOL}://`.length);

// ─── MapLibre opfs:// protocol ────────────────────────────────────────────────

/**
 * MapLibre protocol handler that reads files from OPFS and honours byte-range
 * requests so raster tile renderers (COG, PMTiles, MBTiles) can stream data
 * efficiently without loading the entire file into memory.
 */
const opfsProtocolHandler = async (
  params: { url: string; headers?: Record<string, string> },
  abortController: AbortController,
): Promise<{ data: ArrayBuffer }> => {
  const key = opfsUrlToKey(params.url);
  const file = await getFileFromOpfs(key);

  if (!file) {
    throw new Error(`OPFS file not found: ${key}`);
  }

  if (abortController.signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Honour HTTP Range header for partial reads (required by COG / PMTiles)
  const rangeHeader =
    params.headers?.["range"] ??
    params.headers?.["Range"] ??
    null;

  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) + 1 : file.size;
      const slice = file.slice(start, end);
      const data = await slice.arrayBuffer();
      return { data };
    }
  }

  const data = await file.arrayBuffer();
  return { data };
};

/**
 * Register the opfs:// protocol with MapLibre GL.
 * Safe to call multiple times (idempotent).
 */
export const registerOpfsProtocol = (): void => {
  if (protocolRegistered || typeof window === "undefined") return;
  if (!isOpfsAvailable()) return;

  maplibregl.addProtocol(OPFS_PROTOCOL, opfsProtocolHandler as Parameters<typeof maplibregl.addProtocol>[1]);
  protocolRegistered = true;
};

export const unregisterOpfsProtocol = (): void => {
  if (!protocolRegistered) return;
  maplibregl.removeProtocol(OPFS_PROTOCOL);
  protocolRegistered = false;
};

// ─── Convenience: store + return opfs:// URL ─────────────────────────────────

const buildOpfsKey = (scope: string, fileName: string, suffix = ""): string => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return suffix ? `${scope}__${suffix}__${safe}` : `${scope}__${safe}`;
};

/**
 * Persist a file to OPFS under a stable key derived from the provided scope.
 * Falls back to a blob URL when OPFS is unavailable so callers can degrade
 * gracefully without special-case branching.
 */
export const persistFileInOpfs = async (
  scope: string,
  file: File,
): Promise<string> => {
  if (!isOpfsAvailable()) {
    return URL.createObjectURL(file);
  }

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const key = buildOpfsKey(scope, file.name, uniqueSuffix);
  return storeFileInOpfs(key, file);
};

/**
 * Persist a file to OPFS and return its opfs:// URL.
 * Falls back to a blob: URL if OPFS is unavailable.
 */
export const persistLayerFile = async (
  layerId: string,
  file: File,
): Promise<string> => {
  return persistFileInOpfs(`layer-${layerId}`, file);
};

/**
 * Persist an uploaded file to OPFS and return its opfs:// URL.
 * Useful for upload batches where multiple layers come from the same source
 * file and should share one local cache entry.
 */
export const persistUploadFile = async (scope: string, file: File): Promise<string> => {
  return persistFileInOpfs(`upload-${scope}`, file);
};

/**
 * Resolve an opfs:// URL to a File object, or resolve a blob: URL as-is
 * (the caller already has the file). Returns null if not found.
 */
export const resolveLayerFileUrl = async (
  url: string,
): Promise<File | null> => {
  if (!isOpfsUrl(url)) return null;
  const key = opfsUrlToKey(url);
  return getFileFromOpfs(key);
};
