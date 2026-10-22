// Module resolution hooks for the Node built-in test runner (`npm run test:*`).
// Node does not read tsconfig and no longer supports
// `--experimental-specifier-resolution=node`, so this restores what the Next.js
// bundler does for app code:
//   - the tsconfig `@/*` path alias (mapped to the project root), and
//   - extensionless / directory specifiers (`./foo` -> `./foo.ts`), including
//     inside dependencies that ship bundler-style ESM.
// Loaded via `node --import ./tests/node/alias-hooks.mjs`.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const candidateSuffixes = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js", "/index.mjs"];

function findFile(basePath) {
  for (const suffix of candidateSuffixes) {
    const candidate = basePath + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

function isPathSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("file:");
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = findFile(projectRoot + specifier.slice(2));
      if (resolved) {
        return nextResolve(resolved, context);
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND" && error?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw error;
      if (!isPathSpecifier(specifier) || !context.parentURL) throw error;
      const resolved = findFile(fileURLToPath(new URL(specifier, context.parentURL)));
      if (!resolved) throw error;
      return nextResolve(resolved, context);
    }
  },
});
