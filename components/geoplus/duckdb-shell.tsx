"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Send, LoaderCircle, AlertTriangle } from "lucide-react";
import type * as duckdb from "@duckdb/duckdb-wasm";
import { Input } from "@/components/ui/input";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import {
  initializeDuckDb,
  buildPropertyColumns,
  buildPreparedRows,
  quoteSqlIdentifier,
  formatSqlValue,
  isGeoJsonFeatureCollection,
} from "@/lib/geoplus/duckdb-spatial-analytics";

type HistoryEntry = {
  id: string;
  type: "query" | "success" | "error" | "info";
  content: string;
  data?: Record<string, unknown>[];
  columns?: string[];
};

export function DuckDbShell({ layer }: { layer: GeoPlusLayerItem | null; layers: GeoPlusLayerItem[] }) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { id: "1", type: "info", content: "DuckDB Shell ready. Enter SQL queries to interact with your data." },
  ]);
  const [query, setQuery] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loadedLayers, setLoadedLayers] = useState<Set<string>>(new Set());
  
  const connectionRef = useRef<duckdb.AsyncDuckDBConnection | null>(null);
  const dbRef = useRef<{ db: duckdb.AsyncDuckDB; worker: Worker } | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const activeAlias = useMemo(() => {
    return layer?.name.toLowerCase().replace(/[^a-z0-9]/g, "_") || "features";
  }, [layer]);

  useEffect(() => {
    let isMounted = true;
    
    const initDb = async () => {
      try {
        const { db, worker, connection } = await initializeDuckDb();
        if (!isMounted) {
          connection.close();
          db.terminate();
          worker.terminate();
          return;
        }
        dbRef.current = { db, worker };
        connectionRef.current = connection;
        setIsReady(true);
      } catch (err) {
        console.error("Failed to init DuckDB for Shell:", err);
        if (isMounted) {
          const message = err instanceof Error ? err.message : "Unknown initialization error.";
          setHistory((prev) => [
            ...prev,
            { id: Date.now().toString(), type: "error", content: `Failed to initialize DuckDB. ${message}` },
          ]);
        }
      }
    };
    
    void initDb();

    return () => {
      isMounted = false;
      if (connectionRef.current) connectionRef.current.close().catch(() => {});
      if (dbRef.current) {
        dbRef.current.db.terminate().catch(() => {});
        dbRef.current.worker.terminate();
      }
    };
  }, []);

  const loadLayerIntoDb = async (layerToLoad: GeoPlusLayerItem) => {
    if (!connectionRef.current) return;
    
    const alias = layerToLoad.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (loadedLayers.has(alias)) return alias;

    const sourceFeatures = isGeoJsonFeatureCollection(layerToLoad.inlineData) 
      ? layerToLoad.inlineData.features 
      : isGeoJsonFeatureCollection(layerToLoad.rawInlineData) 
        ? layerToLoad.rawInlineData.features 
        : null;

    if (!sourceFeatures || !Array.isArray(sourceFeatures) || sourceFeatures.length === 0) {
      throw new Error(`Layer ${layerToLoad.name} has no valid vector features.`);
    }

    const propertyColumns = buildPropertyColumns(sourceFeatures);
    const preparedRows = buildPreparedRows(sourceFeatures);
    
    const createColumnSql = [
      `${quoteSqlIdentifier("feature_id")} INTEGER`,
      `${quoteSqlIdentifier("geometry_type")} TEXT`,
      `${quoteSqlIdentifier("longitude")} DOUBLE`,
      `${quoteSqlIdentifier("latitude")} DOUBLE`,
      `${quoteSqlIdentifier("geometry_json")} TEXT`,
      ...propertyColumns.map((column) => `${quoteSqlIdentifier(column.columnName)} ${column.columnType}`),
    ].join(", ");

    const tableName = quoteSqlIdentifier(alias);
    await connectionRef.current.query(`CREATE TABLE ${tableName} (${createColumnSql})`);

    const insertColumns = [
      "feature_id",
      "geometry_type",
      "longitude",
      "latitude",
      "geometry_json",
      ...propertyColumns.map((column) => column.columnName),
    ];
    const insertColumnsSql = insertColumns.map((columnName) => quoteSqlIdentifier(columnName)).join(", ");

    const chunkSize = 400;
    for (let start = 0; start < preparedRows.length; start += chunkSize) {
      const rows = preparedRows.slice(start, start + chunkSize);
      const valuesSql = rows
        .map((row) => {
          const baseValues = [
            formatSqlValue(row.featureId, "INTEGER"),
            formatSqlValue(row.geometryType, "TEXT"),
            formatSqlValue(row.longitude, "DOUBLE"),
            formatSqlValue(row.latitude, "DOUBLE"),
            formatSqlValue(row.geometryJson, "TEXT"),
          ];

          const propertyValues = propertyColumns.map((column) => {
            const rawValue = row.properties[column.originalName];
            return formatSqlValue(rawValue, column.columnType);
          });

          return `(${[...baseValues, ...propertyValues].join(", ")})`;
        })
        .join(", ");

      await connectionRef.current.query(`INSERT INTO ${tableName} (${insertColumnsSql}) VALUES ${valuesSql}`);
    }

    setLoadedLayers((prev) => new Set(prev).add(alias));
    return alias;
  };

  const handleQuery = async () => {
    const q = query.trim();
    if (!q || !isReady || !connectionRef.current) return;
    
    setQuery("");
    setHistory((prev) => [...prev, { id: Date.now().toString(), type: "query", content: q }]);
    setIsExecuting(true);

    try {
      if (layer) {
        await loadLayerIntoDb(layer);
      }

      const result = await connectionRef.current.query(q);
      const rows = result.toArray().map((r) => r.toJSON());
      
      let columns: string[] = [];
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      }

      setHistory((prev) => [
        ...prev,
        { 
          id: Date.now().toString(), 
          type: "success", 
          content: `Query returned ${rows.length} rows.`, 
          data: rows.slice(0, 100), // Cap at 100 rows for shell preview
          columns 
        },
      ]);
    } catch (error) {
      setHistory((prev) => [
        ...prev,
        { id: Date.now().toString(), type: "error", content: error instanceof Error ? error.message : "Unknown error executing query." },
      ]);
    } finally {
      setIsExecuting(false);
    }
  };

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div className="flex h-full w-full flex-col bg-background/95 font-mono text-xs">
      <div 
        ref={historyRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {history.map((entry) => (
          <div key={entry.id} className="space-y-1">
            {entry.type === "query" ? (
              <div className="flex items-start gap-2 text-muted-foreground">
                <span className="select-none text-accent">❯</span>
                <span className="whitespace-pre-wrap break-all text-foreground">{entry.content}</span>
              </div>
            ) : entry.type === "error" ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap break-all">{entry.content}</span>
              </div>
            ) : entry.type === "info" ? (
              <div className="flex items-start gap-2 text-muted-foreground italic">
                <span className="whitespace-pre-wrap break-all">{entry.content}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-emerald-500/80">{entry.content} {entry.data && entry.data.length > 0 ? "(Previewing up to 100)" : ""}</div>
                {entry.columns && entry.columns.length > 0 && entry.data && entry.data.length > 0 && (
                  <div className="overflow-x-auto max-w-full rounded border border-border/50">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-muted/30">
                        <tr>
                          {entry.columns.map(c => (
                            <th key={c} className="border-b border-border/50 border-r last:border-r-0 px-2 py-1 font-semibold text-muted-foreground truncate max-w-[150px]">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entry.data.map((row, i) => (
                          <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                            {entry.columns!.map(c => (
                              <td key={c} className="border-r border-border/50 last:border-r-0 px-2 py-1 truncate max-w-[150px] text-foreground/80">
                                {row[c] === null ? <span className="italic opacity-50">null</span> : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {isExecuting && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin text-accent" />
            <span>Executing...</span>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 p-3 bg-muted/20">
        {!isReady ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            <span>Initializing DuckDB WASM...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
              <span>Active alias: <span className="font-semibold text-accent">{activeAlias}</span></span>
              <span>Try: <code className="bg-muted/50 px-1 py-0.5 rounded">SELECT * FROM {activeAlias} LIMIT 5</code></span>
            </div>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-accent font-bold">❯</span>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleQuery();
                  }
                }}
                disabled={isExecuting}
                placeholder={`SELECT COUNT(*) FROM ${activeAlias}`}
                className="pl-7 pr-10 font-mono text-xs bg-background focus-visible:ring-accent/50"
              />
              <button
                onClick={handleQuery}
                disabled={!query.trim() || isExecuting}
                className="absolute right-2 p-1 text-muted-foreground hover:text-accent disabled:opacity-50 disabled:hover:text-muted-foreground transition-colors"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
