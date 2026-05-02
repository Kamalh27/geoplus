import type { NominatimSearchResult } from "@/components/geoplus/types";

const SEARCH_QUERY_MIN_LENGTH = 2;
const SEARCH_QUERY_MAX_LENGTH = 120;
const SEARCH_RESULT_LIMIT = 5;
const SEARCH_TIMEOUT_MS = 8_000;
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";

export class SearchProxyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const isNominatimSearchResult = (value: unknown): value is NominatimSearchResult => {
  const entry = asRecord(value);
  return entry !== null && typeof entry.display_name === "string" && typeof entry.lat === "string" && typeof entry.lon === "string";
};

export const normalizeSearchQuery = (value: string) => value.trim().replace(/\s+/g, " ");

export const validateSearchQuery = (value: string) => {
  const normalized = normalizeSearchQuery(value);

  if (normalized.length < SEARCH_QUERY_MIN_LENGTH) {
    throw new SearchProxyError("Search query is too short.", 400);
  }

  if (normalized.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new SearchProxyError("Search query is too long.", 400);
  }

  return normalized;
};

export const buildSearchRequestHeaders = (acceptLanguage: string | null) => {
  const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "GeoPlus";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://geoplus.spadace.com";
  const appVersion = process.env.NEXT_PUBLIC_PRODUCT_VERSION?.trim() || "dev";

  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": `${appName}/${appVersion} (+${appUrl})`,
    Referer: appUrl,
  });

  if (acceptLanguage?.trim()) {
    headers.set("Accept-Language", acceptLanguage.trim());
  }

  return headers;
};

export const buildNominatimSearchUrl = (query: string) => {
  const url = new URL(NOMINATIM_BASE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(SEARCH_RESULT_LIMIT));
  url.searchParams.set("q", validateSearchQuery(query));
  return url;
};

export const normalizeSearchResults = (payload: unknown): NominatimSearchResult[] =>
  Array.isArray(payload) ? payload.filter(isNominatimSearchResult).slice(0, SEARCH_RESULT_LIMIT) : [];

export const fetchNominatimSearchResults = async (args: {
  query: string;
  acceptLanguage: string | null;
  fetchImpl?: typeof fetch;
}) => {
  const { query, acceptLanguage, fetchImpl = fetch } = args;
  const targetUrl = buildNominatimSearchUrl(query);

  let response: Response;
  try {
    response = await fetchImpl(targetUrl, {
      method: "GET",
      headers: buildSearchRequestHeaders(acceptLanguage),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new SearchProxyError("Search upstream timed out.", 504);
    }
    throw new SearchProxyError("Search upstream failed.", 502);
  }

  if (response.status === 429) {
    throw new SearchProxyError("Search upstream rate limited the request.", 503);
  }

  if (!response.ok) {
    throw new SearchProxyError("Search upstream returned an error.", 502);
  }

  return normalizeSearchResults((await response.json()) as unknown);
};
