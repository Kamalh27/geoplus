/**
 * GeoPlus calls Spadace core through its own server (plan P3-b4). The browser only talks to `/api/core/api/v1/...`
 * on this origin; the server adds `Authorization: Bearer <Account access token>` (audience `geoplus`) from the
 * sealed session cookie and forwards the call. No cookie is ever sent to core, and core's answer never sets one here.
 *
 * Plain `Request` / `Response` only (no Next.js imports) so the whole path is covered by node tests. Never log tokens:
 * this module logs nothing.
 */
import { getLoginUrl, resolveNextUrl } from "../geoplus/auth.ts";
import {
  SIGN_IN_MAX_LIFETIME_SECONDS,
  ensureFreshSession,
  isSameOriginRequest,
  sessionCookie,
  sessionCookieName,
  unsealSession,
  type AccountClientConfig,
  type CookieSpec,
  type RefreshCoordinator,
} from "./account-session.ts";

/** Where the browser reaches the proxy; everything after it is the core path (`/api/v1/...`). */
export const CORE_PROXY_PREFIX = "/api/core";
/** The only part of core this server reaches. */
const ALLOWED_CORE_PREFIX = "/api/v1/";

const DEFAULT_CORE_BACKEND_URL_DEV = "http://localhost:8010"; // core API in development (8000 is another project)
const DEFAULT_CORE_BACKEND_URL_PROD = "https://api.spadace.com";

type Env = Record<string, string | undefined>;

function absoluteHttpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Core's base address for server-side calls: `CORE_BACKEND_URL`, else the older public setting, else the default. */
export function coreBackendUrl(env: Env = process.env): string {
  return (
    absoluteHttpUrl(env.CORE_BACKEND_URL) ??
    absoluteHttpUrl(env.NEXT_PUBLIC_CORE_BACKEND_URL) ??
    (env.NODE_ENV === "production" ? DEFAULT_CORE_BACKEND_URL_PROD : DEFAULT_CORE_BACKEND_URL_DEV)
  );
}

/**
 * The address on core for `pathname` + `search`, or null when it is not an allowed path: only `/api/v1/<something>`,
 * with no dot segments, no encoded or raw slashes or backslashes inside a segment, no control characters, and the
 * result must stay on core's origin.
 */
export function coreTargetUrl(pathname: string, search: string, coreBaseUrl: string): URL | null {
  if (!pathname.startsWith(ALLOWED_CORE_PREFIX) || pathname.length === ALLOWED_CORE_PREFIX.length) return null;
  if (pathname.includes("\\") || /[\u0000-\u001f\u007f]/.test(pathname)) return null;
  const rest = pathname.slice(ALLOWED_CORE_PREFIX.length);
  for (const segment of rest.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (!segment || segment === "." || segment === ".." || decoded === "." || decoded === "..") return null;
    if (decoded.includes("/") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  }
  let base: URL;
  let target: URL;
  try {
    base = new URL(coreBaseUrl);
    target = new URL(`${pathname}${search}`, base);
  } catch {
    return null;
  }
  if (target.origin !== base.origin || !target.pathname.startsWith(ALLOWED_CORE_PREFIX)) return null;
  return target;
}

// ---------------------------------------------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------------------------------------------

/** What the browser may hand on to core. Cookie, Authorization, Origin, Referer and forwarding headers are not here. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "content-length",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "range",
  "x-request-id",
] as const;

/** What core's answer may hand back. Set-Cookie, Location, CORS, encoding and length headers are not here. */
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-language",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "retry-after",
  "x-request-id",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
] as const;

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

const jsonAnswer = (status: number, body: unknown, extra?: Headers): Response => {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
};

// ---------------------------------------------------------------------------------------------------------------
// Cookies (plain Request / Response)
// ---------------------------------------------------------------------------------------------------------------

/** `Set-Cookie` text for a cookie spec (value URL-encoded, as Next.js writes and reads it). */
export function serializeCookie(spec: CookieSpec): string {
  const { options } = spec;
  const parts = [`${spec.name}=${encodeURIComponent(spec.value)}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push("SameSite=Lax");
  return parts.join("; ");
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The proxy
// ---------------------------------------------------------------------------------------------------------------

export type CoreProxyOptions = {
  /** Null: Account sign-in is not configured here. */
  config: AccountClientConfig | null;
  deps: { fetch: typeof fetch; now: () => number; coordinator: RefreshCoordinator };
  coreBaseUrl: string;
  /** Origins that may make this server change something: its own, and the registered return address's. */
  allowedOrigins: string[];
};

/** Where a "please sign in" answer sends the browser: back to the page that asked (same origin only, sanitised). */
function signInAddress(request: Request, allowedOrigins: string[]): string {
  let next: string = "/";
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (allowedOrigins.includes(url.origin)) next = `${url.pathname}${url.search}`;
    } catch {
      // keep "/"
    }
  }
  // Same sanitising as the login route: local paths only, never /api or /auth.
  const base = new URL(allowedOrigins[0] ?? "http://geoplus.invalid");
  const resolved = resolveNextUrl(next, base);
  return getLoginUrl(`${resolved.pathname}${resolved.search}`);
}

const signedOutAnswer = (request: Request, allowedOrigins: string[], cookie: string | null): Response => {
  const headers = new Headers();
  if (cookie) headers.append("Set-Cookie", cookie);
  return jsonAnswer(401, { error: "signed_out", login_url: signInAddress(request, allowedOrigins) }, headers);
};

export async function proxyCoreRequest(request: Request, options: CoreProxyOptions): Promise<Response> {
  const { config, deps, coreBaseUrl, allowedOrigins } = options;
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    return jsonAnswer(405, { error: "method_not_allowed" }, new Headers({ Allow: ALLOWED_METHODS.join(", ") }));
  }

  const url = new URL(request.url);
  if (!(url.pathname === CORE_PROXY_PREFIX || url.pathname.startsWith(`${CORE_PROXY_PREFIX}/`))) {
    return jsonAnswer(404, { error: "not_found" });
  }
  const target = coreTargetUrl(url.pathname.slice(CORE_PROXY_PREFIX.length), url.search, coreBaseUrl);
  if (!target) return jsonAnswer(404, { error: "not_found" });

  // Same origin only. Calls that change something need our own Origin (or Sec-Fetch-Site: same-origin); a cross-site
  // read is refused as well, so another site cannot make the browser use this session.
  if (method === "GET" || method === "HEAD") {
    if (request.headers.get("sec-fetch-site") === "cross-site") return jsonAnswer(403, { error: "forbidden" });
  } else if (!isSameOriginRequest(request.headers, allowedOrigins)) {
    return jsonAnswer(403, { error: "forbidden" });
  }

  if (!config) return jsonAnswer(503, { error: "not_configured" });

  const sealed = readCookie(request.headers.get("cookie"), sessionCookieName(config));
  const fresh = await ensureFreshSession(config, sealed, deps);

  // The cookie to write on whatever answer follows: a rotated session, a cleared one, or none.
  let cookie: string | null = null;
  if (typeof fresh.setCookie === "string") {
    const session = fresh.session;
    cookie = serializeCookie(sessionCookie(config, fresh.setCookie, deps.now(), session ? session.signedInAt : deps.now()));
  } else if (fresh.setCookie === null) {
    cookie = serializeCookie(sessionCookie(config, null, deps.now(), deps.now()));
  }
  const withCookie = (response: Response): Response => {
    if (cookie) response.headers.append("Set-Cookie", cookie);
    return response;
  };

  if (fresh.outcome === "none" || fresh.outcome === "signed_out" || !fresh.session) {
    return signedOutAnswer(request, allowedOrigins, cookie);
  }
  if (fresh.outcome === "unavailable") {
    return withCookie(jsonAnswer(503, { error: "account_unavailable" }));
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Authorization", `Bearer ${fresh.session.accessToken}`);

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    redirect: "error",
    cache: "no-store",
    signal: request.signal,
  };
  if (METHODS_WITH_BODY.has(method) && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await deps.fetch(target.toString(), init);
  } catch {
    // Unreachable core, a refused redirect, or the browser went away. Nothing from the error is shown or logged.
    return withCookie(jsonAnswer(502, { error: "core_unavailable" }));
  }

  if (upstream.status === 401) {
    void upstream.body?.cancel().catch(() => undefined);
    return signedOutAnswer(request, allowedOrigins, cookie);
  }

  const out = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set("Cache-Control", "private, no-store");
  return withCookie(new Response(method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out }));
}

// ---------------------------------------------------------------------------------------------------------------
// Server pages
// ---------------------------------------------------------------------------------------------------------------

/** Seconds before expiry from which a page no longer uses the access token it was handed. */
const PAGE_TOKEN_MARGIN_SECONDS = 10;

/**
 * A call to core from a server-rendered page, with the session's access token as it is. Pages cannot write cookies,
 * so this never renews (a renewal would spend the refresh token without storing the new one): when the access token
 * is missing or about to expire it answers null, and the browser's own calls through the proxy renew the session.
 * Also null for a path outside `/api/v1/`, and when core cannot be reached.
 */
export async function fetchCoreWithCurrentSession(
  config: AccountClientConfig,
  sealed: string | null | undefined,
  path: string,
  init: RequestInit,
  deps: { fetch: typeof fetch; now: () => number; coreBaseUrl: string },
): Promise<Response | null> {
  const session = unsealSession(config, sealed);
  if (!session) return null;
  const now = deps.now();
  if (now >= session.signedInAt + SIGN_IN_MAX_LIFETIME_SECONDS) return null;
  if (now >= session.accessExpiresAt - PAGE_TOKEN_MARGIN_SECONDS) return null;
  const queryAt = path.indexOf("?");
  const target = coreTargetUrl(queryAt < 0 ? path : path.slice(0, queryAt), queryAt < 0 ? "" : path.slice(queryAt), deps.coreBaseUrl);
  if (!target) return null;
  const headers = new Headers(init.headers);
  headers.delete("cookie");
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  try {
    return await deps.fetch(target.toString(), { ...init, headers, redirect: "error", cache: "no-store" });
  } catch {
    return null;
  }
}
