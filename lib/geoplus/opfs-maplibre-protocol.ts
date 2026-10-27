// Kept apart from opfs-storage.ts so server routes that import the storage helpers do not pull
// maplibre-gl (a browser-only ESM bundle) into the server module graph.
import * as maplibregl from "maplibre-gl";
import { isOpfsAvailable, OPFS_PROTOCOL, opfsProtocolHandler } from "@/lib/geoplus/opfs-storage";

let protocolRegistered = false;

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
