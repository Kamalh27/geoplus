/**
 * Browser side of the core proxy (plan P3-b4). Client-safe: no tokens, no server imports.
 *
 * GeoPlus never calls core from the browser. Every call goes to this origin's `/api/core/api/v1/...`, where the
 * server adds the Account bearer token (`lib/server/core-proxy.ts`).
 */

export const CORE_PROXY_PREFIX = "/api/core";

/** The same-origin address for a core path such as `/api/v1/projects?limit=5`. Only `/api/v1/...` paths exist. */
export function coreApiUrl(path: string): string {
  if (!path.startsWith("/api/v1/") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) {
    throw new Error("Core calls must be /api/v1/... paths.");
  }
  return `${CORE_PROXY_PREFIX}${path}`;
}

/** `fetch` against core through the proxy: same-origin credentials (the session cookie), no cache. */
export function coreFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(coreApiUrl(path), { cache: "no-store", ...init, credentials: "same-origin" });
}
