// Copies the DuckDB-WASM bundles from node_modules into public/duckdb/ (gitignored) so they are
// served same-origin (required by our CSP) without committing ~75 MB of binaries.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const target = join(root, "public", "duckdb");
const files = ["duckdb-mvp.wasm", "duckdb-eh.wasm", "duckdb-browser-mvp.worker.js", "duckdb-browser-eh.worker.js"];

if (!existsSync(source)) {
  console.warn("copy-duckdb: @duckdb/duckdb-wasm is not installed; skipping.");
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const file of files) {
  copyFileSync(join(source, file), join(target, file));
}
console.log(`copy-duckdb: copied ${files.length} files to public/duckdb`);
