export type DuckDbBundle = {
  mainModule: string;
  mainWorker: string | null;
  pthreadWorker?: string | null;
};

export type ResolvedDuckDbBundle = {
  mainModule: string;
  mainWorker: string;
  pthreadWorker?: string | null;
};

export const hasUsableDuckDbBundle = (bundle: DuckDbBundle): bundle is ResolvedDuckDbBundle =>
  typeof bundle.mainModule === "string" && typeof bundle.mainWorker === "string";

export const getLocalDuckDbBundles = () =>
  ({
    mvp: {
      mainModule: "/duckdb/duckdb-mvp.wasm",
      mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
    },
    eh: {
      mainModule: "/duckdb/duckdb-eh.wasm",
      mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
    },
  }) satisfies Record<"mvp" | "eh", DuckDbBundle>;
