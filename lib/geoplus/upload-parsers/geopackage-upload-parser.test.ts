import assert from "node:assert/strict";
import test from "node:test";

import {
  configureGeoPackageRuntime,
  resolvePublicAssetUrl,
} from "./geopackage-upload-parser.ts";

test("resolvePublicAssetUrl keeps GeoPackage wasm lookup on the script directory", () => {
  const wasmUrl = resolvePublicAssetUrl(
    "https://example.com/app/geopackage.min.js",
    "sql-wasm.wasm",
  );

  assert.equal(wasmUrl, "https://example.com/app/sql-wasm.wasm");
});

test("configureGeoPackageRuntime wires sql.js wasm lookup from the app public root", () => {
  let locateFile: ((filename: string) => string) | null = null;
  const runtime = {
    setSqljsWasmLocateFile: (fn: (filename: string) => string) => {
      locateFile = fn;
    },
  } as unknown as Parameters<typeof configureGeoPackageRuntime>[0];

  configureGeoPackageRuntime(runtime);

  assert.ok(locateFile);
  assert.equal((locateFile as (filename: string) => string)("sql-wasm.wasm"), "/sql-wasm.wasm");
});
