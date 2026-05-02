import type { NominatimSearchResult } from "@/components/geoplus/types";

function isNominatimSearchResult(value: unknown): value is NominatimSearchResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return typeof entry.display_name === "string" && typeof entry.lat === "string" && typeof entry.lon === "string";
}

export async function searchNominatimLocations(query: string, signal: AbortSignal): Promise<NominatimSearchResult[]> {
  const response = await fetch(`/api/geoplus/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("search_failed");
  }

  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? payload.filter(isNominatimSearchResult) : [];
}
