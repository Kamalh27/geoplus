// maplibre-gl 6 loads its web worker from a file next to the main module, which a
// bundled app cannot resolve. scripts/sync-maplibre-worker.mjs copies the worker (and
// the shared chunk it imports) into public/vendor/maplibre/; this module points maplibre
// at it. Same-origin hosting satisfies the CSP (`worker-src 'self'`).
// Import this for its side effect from every module that creates a map.
import * as maplibregl from "maplibre-gl";

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(`${window.location.origin}/vendor/maplibre/maplibre-gl-worker.mjs`);
}
