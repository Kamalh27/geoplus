import type { GeoPlusLayerItem } from "../../components/geoplus/types.ts";

export const DASHBOARD_DRAFT_STORAGE_KEY = "geoplus-dashboard-draft-v1";

type DashboardDraftPayload = {
  version: 1;
  savedAt: string;
  layers: GeoPlusLayerItem[];
};

function stripNonSerializableLayerState(layer: GeoPlusLayerItem): Omit<GeoPlusLayerItem, "originalFile"> {
  const { originalFile, ...serializableLayer } = layer;
  void originalFile;
  if (serializableLayer.inlineData !== undefined) {
    delete serializableLayer.rawInlineData;
  }
  return serializableLayer;
}

function restoreLayerDefaults(layer: GeoPlusLayerItem): GeoPlusLayerItem {
  if (layer.rawInlineData === undefined && layer.inlineData !== undefined) {
    return {
      ...layer,
      rawInlineData: layer.inlineData,
    };
  }
  return layer;
}

export function createDashboardDraftSnapshot(layers: GeoPlusLayerItem[]): string {
  const payload: DashboardDraftPayload = {
    version: 1,
    savedAt: new Date().toISOString(),
    layers: layers.map((layer) => {
      const serializableLayer = stripNonSerializableLayerState(layer);
      return JSON.parse(JSON.stringify(serializableLayer)) as GeoPlusLayerItem;
    }),
  };

  return JSON.stringify(payload);
}

export function parseDashboardDraftSnapshot(snapshot: string): GeoPlusLayerItem[] | null {
  try {
    const parsed = JSON.parse(snapshot) as Partial<DashboardDraftPayload> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.layers)) {
      return null;
    }

    return parsed.layers
      .filter((layer): layer is GeoPlusLayerItem => Boolean(layer) && typeof layer === "object")
      .map(restoreLayerDefaults);
  } catch {
    return null;
  }
}

export function readDashboardDraft(storage: Storage): GeoPlusLayerItem[] | null {
  const snapshot = storage.getItem(DASHBOARD_DRAFT_STORAGE_KEY);
  if (!snapshot) {
    return null;
  }
  return parseDashboardDraftSnapshot(snapshot);
}

export function writeDashboardDraft(storage: Storage, layers: GeoPlusLayerItem[]): void {
  storage.setItem(DASHBOARD_DRAFT_STORAGE_KEY, createDashboardDraftSnapshot(layers));
}

export function clearDashboardDraft(storage: Storage): void {
  storage.removeItem(DASHBOARD_DRAFT_STORAGE_KEY);
}
