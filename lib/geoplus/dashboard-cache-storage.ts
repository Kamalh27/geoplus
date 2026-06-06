"use client";

import type { GeoPlusLayerItem } from "@/components/geoplus/types";
import { isOpfsAvailable } from "@/lib/geoplus/opfs-storage";

export type GeoPlusDashboardCacheRole = "editor" | "viewer";

export type CachedGeoPlusDashboard = {
  id: string;
  name?: string | null;
  project_uid?: string | null;
  layers: GeoPlusLayerItem[];
  settings?: unknown;
  layout_config?: unknown;
  updated_at?: string | null;
};

export type GeoPlusDashboardCacheEnvelope = {
  dashboardId: string;
  role: GeoPlusDashboardCacheRole;
  cachedAt: string;
  backendUpdatedAt?: string | null;
  data: CachedGeoPlusDashboard;
};

const CACHE_ROOT = "geoplus";
const DASHBOARDS_DIR = "dashboard-cache";
const DASHBOARD_FILE = "dashboard.json";
const ASSETS_DIR = "assets";

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || "dashboard";
}

async function getDashboardCacheDir(
  dashboardId: string,
  options: { create: boolean },
): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsAvailable()) return null;

  try {
    const root = await navigator.storage.getDirectory();
    const geoplus = await root.getDirectoryHandle(CACHE_ROOT, { create: options.create });
    const dashboards = await geoplus.getDirectoryHandle(DASHBOARDS_DIR, { create: options.create });
    return dashboards.getDirectoryHandle(safeName(dashboardId), { create: options.create });
  } catch {
    return null;
  }
}

function normalizeDashboardPayload(
  dashboardId: string,
  payload: Partial<CachedGeoPlusDashboard>,
): CachedGeoPlusDashboard {
  return {
    ...payload,
    id: typeof payload.id === "string" && payload.id.trim() ? payload.id.trim() : dashboardId,
    layers: Array.isArray(payload.layers) ? payload.layers : [],
    project_uid:
      typeof payload.project_uid === "string" && payload.project_uid.trim()
        ? payload.project_uid.trim()
        : null,
    updated_at:
      typeof payload.updated_at === "string" && payload.updated_at.trim()
        ? payload.updated_at.trim()
        : null,
  };
}

export async function readCachedDashboard(
  dashboardId: string,
): Promise<GeoPlusDashboardCacheEnvelope | null> {
  const directory = await getDashboardCacheDir(dashboardId, { create: false });
  if (!directory) return null;

  try {
    const handle = await directory.getFileHandle(DASHBOARD_FILE);
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text()) as GeoPlusDashboardCacheEnvelope;
    if (parsed.dashboardId !== dashboardId || !parsed.data || !Array.isArray(parsed.data.layers)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedDashboard(
  dashboardId: string,
  payload: Partial<CachedGeoPlusDashboard>,
  options: { role: GeoPlusDashboardCacheRole },
): Promise<boolean> {
  const directory = await getDashboardCacheDir(dashboardId, { create: true });
  if (!directory) return false;

  const data = normalizeDashboardPayload(dashboardId, payload);
  const envelope: GeoPlusDashboardCacheEnvelope = {
    dashboardId,
    role: options.role,
    cachedAt: new Date().toISOString(),
    backendUpdatedAt: data.updated_at ?? null,
    data,
  };

  try {
    const handle = await directory.getFileHandle(DASHBOARD_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(envelope));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export function buildDashboardAssetCacheKey(sourceUrl: string, fallback = "asset"): string {
  try {
    const parsed = new URL(sourceUrl, window.location.origin);
    return safeName(`${parsed.pathname}${parsed.search || ""}`);
  } catch {
    return safeName(sourceUrl || fallback);
  }
}

export async function readCachedDashboardAsset(
  dashboardId: string,
  assetKey: string,
): Promise<File | null> {
  const directory = await getDashboardCacheDir(dashboardId, { create: false });
  if (!directory) return null;

  try {
    const assets = await directory.getDirectoryHandle(ASSETS_DIR);
    const handle = await assets.getFileHandle(safeName(assetKey));
    return handle.getFile();
  } catch {
    return null;
  }
}

export async function writeCachedDashboardAsset(
  dashboardId: string,
  assetKey: string,
  blob: Blob,
): Promise<boolean> {
  const directory = await getDashboardCacheDir(dashboardId, { create: true });
  if (!directory) return false;

  try {
    const assets = await directory.getDirectoryHandle(ASSETS_DIR, { create: true });
    const handle = await assets.getFileHandle(safeName(assetKey), { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
