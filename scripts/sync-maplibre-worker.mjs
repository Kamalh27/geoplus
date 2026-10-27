#!/usr/bin/env node
// maplibre-gl 6 loads its web worker from a file next to the main module. A
// bundled app cannot resolve that, so the worker (and the shared chunk it
// imports) are copied into public/ and passed to maplibre via setWorkerUrl().
// Same-origin hosting also keeps the CSP simple (no blob: workers needed).
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "vendor", "maplibre");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(to, { recursive: true });
for (const file of files) await copyFile(join(from, file), join(to, file));
console.log(`maplibre worker files copied to ${to}`);
