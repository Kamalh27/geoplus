/**
 * Browser side of the core proxy (plan P3-b4). Client-safe: no tokens, no server imports.
 *
 * GeoPlus never calls core from the browser. Every call goes to this origin's `/api/core/api/v1/...`, where the
 * server adds the Account bearer token (`lib/server/core-proxy.ts`).
 */

import { getLoginUrl, LOGIN_START_PATH } from "./auth.ts";

export const CORE_PROXY_PREFIX = "/api/core";
/** After one redirect to sign in, none for this long, so a core that keeps refusing cannot cause a loop. */
export const SIGN_IN_REDIRECT_COOLDOWN_MS = 30_000;
const REDIRECT_KEY = "geoplus-signin-redirect-at";
const LOCAL_BASE = "http://geoplus.invalid";

/** The same-origin address for a core path such as `/api/v1/projects?limit=5`. Only `/api/v1/...` paths exist. */
export function coreApiUrl(path: string): string {
  if (!path.startsWith("/api/v1/") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) {
    throw new Error("Core calls must be /api/v1/... paths.");
  }
  return `${CORE_PROXY_PREFIX}${path}`;
}

export type RedirectGuard = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/**
 * Where to go to sign in again after a `signed_out` answer. The server's `login_url` is used only when it is the
 * local sign-in route; its `next` and `organisation` are sanitised again here. Anything else falls back to signing
 * in and returning to the current page.
 */
export function resolveSignInTarget(body: unknown, location: { pathname: string; search: string }): string {
  const fallback = getLoginUrl(`${location.pathname}${location.search}`);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fallback;
  const value = (body as Record<string, unknown>).login_url;
  if (typeof value !== "string" || value.length > 2048 || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, LOCAL_BASE);
    if (url.origin !== LOCAL_BASE || url.pathname !== LOGIN_START_PATH) return fallback;
    return getLoginUrl(url.searchParams.get("next"), url.searchParams.get("organisation"));
  } catch {
    return fallback;
  }
}

/**
 * A `signed_out` answer means the session is gone or core refused the token. Returns the address to sign in at, or
 * null when a redirect was already started less than the cooldown ago.
 */
export function handleSignedOut(
  body: unknown,
  location: { pathname: string; search: string },
  now: number,
  storage: RedirectGuard | null,
): string | null {
  try {
    const raw = storage?.getItem(REDIRECT_KEY);
    const last = raw == null ? NaN : Number(raw);
    if (Number.isFinite(last) && now - last < SIGN_IN_REDIRECT_COOLDOWN_MS) return null;
    storage?.setItem(REDIRECT_KEY, String(now));
  } catch {
    // No storage: redirect anyway; the sign-in start route is cheap and the page reload resets state.
  }
  return resolveSignInTarget(body, location);
}

function sessionStorageGuard(): RedirectGuard | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * `fetch` against core through the proxy: same-origin credentials (the session cookie), no cache. A 401
 * `signed_out` answer sends the person to sign in again (at most once per 30 s); the response is still returned.
 * A 503 (Account unavailable, session kept) is returned as it is.
 */
export async function coreFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(coreApiUrl(path), { cache: "no-store", ...init, credentials: "same-origin" });
  if (response.status === 401 && typeof window !== "undefined") {
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
    if (body && typeof body === "object" && (body as Record<string, unknown>).error === "signed_out") {
      const target = handleSignedOut(body, window.location, Date.now(), sessionStorageGuard());
      if (target) window.location.assign(target);
    }
  }
  return response;
}
