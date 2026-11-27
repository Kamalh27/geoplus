/**
 * Sign-in for GeoPlus (plan P3-b3). Client-safe: no server-only imports, no tokens.
 *
 * GeoPlus signs in through Spadace Account as its own web client (`geoplus-web-dev` in development) and keeps
 * the Account tokens in a sealed HttpOnly cookie (`lib/server/account-session.ts`). The browser only ever sees
 * the routes below.
 */

/** Starts sign-in: `GET /api/geoplus/auth/login?next=<local path>[&organisation=<uuid>]`. */
export const LOGIN_START_PATH = "/api/geoplus/auth/login";
/** Ends the GeoPlus session: `POST`, answers `{ redirect_to }` (Account's end-session address). */
export const LOGOUT_PATH = "/api/geoplus/auth/logout";
/** Registered return and sign-out addresses (contracts/products.toml `geoplus-web-dev`). */
export const CALLBACK_PATH = "/auth/callback";
export const SIGNED_OUT_PATH = "/auth/signed-out";
export const AUTH_ERROR_PATH = "/auth/error";

/**
 * Core's own cookie, still read during the move to Account sign-in (until P3-b4 sends core calls through the
 * GeoPlus server with a bearer token).
 */
export const AUTH_COOKIE_NAME = "access_token";

/** Core frontend in development (core web runs on 3010; 3000 belongs to another project). */
const DEFAULT_CORE_FRONTEND_URL = "http://localhost:3010";

function normalizeAbsoluteUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export const CORE_FRONTEND_URL =
  normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_CORE_URL ?? "") ?? DEFAULT_CORE_FRONTEND_URL;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NEXT_LENGTH = 2048;
const LOCAL_BASE = "http://geoplus.invalid";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * The return target after sign-in, from untrusted input: a local path on this origin (starts with `/`, never
 * `//` or a backslash), else `/`. Sign-in, callback and API paths become `/` so sign-in cannot loop.
 */
export function sanitizeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const value = raw.trim();
  if (!value || value.length > MAX_NEXT_LENGTH) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  let resolved: URL;
  try {
    resolved = new URL(value, LOCAL_BASE);
  } catch {
    return "/";
  }
  if (resolved.origin !== LOCAL_BASE) return "/";
  const path = resolved.pathname;
  // Dot segments collapse while parsing ("/.//evil.com", "/%2e//evil.com", "/a/..//evil.com" all become
  // "//evil.com"), so the resolved path is checked again: a leading "//" or any backslash would leave this origin.
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /^\/%2f/i.test(path)) return "/";
  if (path === "/auth" || path.startsWith("/auth/") || path === "/api" || path.startsWith("/api/")) return "/";
  const result = `${path}${resolved.search}${resolved.hash}`;
  // The result must parse to the same origin on its own as well.
  try {
    if (new URL(result, LOCAL_BASE).origin !== LOCAL_BASE) return "/";
  } catch {
    return "/";
  }
  return result;
}

/**
 * The absolute redirect target after sign-in: `next` sanitised and resolved against `base` (the registered return
 * address). Anything that would leave `base`'s origin becomes `base`'s `/`.
 */
export function resolveNextUrl(next: unknown, base: URL): URL {
  const fallback = new URL("/", base);
  let target: URL;
  try {
    target = new URL(sanitizeNextPath(next), base);
  } catch {
    return fallback;
  }
  return target.origin === base.origin ? target : fallback;
}

/** Where every "please sign in" sends the browser (same origin). */
export const getLoginUrl = (next?: unknown, organisation?: unknown): string => {
  const params = new URLSearchParams({ next: sanitizeNextPath(next) });
  if (isUuid(organisation)) params.set("organisation", organisation);
  return `${LOGIN_START_PATH}?${params.toString()}`;
};

export const getLogoutUrl = (): string => LOGOUT_PATH;

/**
 * Where the browser goes after `POST /api/geoplus/auth/logout`: the `redirect_to` the server answered when it is
 * Account's end-session address (absolute http(s)) or a local path, else the local signed-out page.
 */
export function resolveLogoutTarget(body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const value = (body as Record<string, unknown>).redirect_to;
    if (typeof value === "string" && value.length <= 4096) {
      if (value.startsWith("/") && sanitizeNextPath(value) === value) return value;
      if (value === SIGNED_OUT_PATH) return value;
      try {
        const url = new URL(value);
        if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.toString();
      } catch {
        // fall through
      }
    }
  }
  return SIGNED_OUT_PATH;
}

export type AuthErrorCode = "sign_in_failed" | "account_unavailable" | "not_configured";

export function parseAuthErrorCode(raw: unknown): AuthErrorCode {
  return raw === "account_unavailable" || raw === "not_configured" ? raw : "sign_in_failed";
}

export function authErrorPath(code: AuthErrorCode): string {
  return `${AUTH_ERROR_PATH}?${new URLSearchParams({ code }).toString()}`;
}

/** Fixed text for each refusal; nothing from the URL or from Account is shown. */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, { title: string; body: string }> = {
  sign_in_failed: {
    title: "Sign-in did not finish",
    body: "The sign-in could not be completed. It may have taken too long or been started in another window. Please try again.",
  },
  account_unavailable: {
    title: "Spadace Account is unavailable",
    body: "We could not reach Spadace Account. Please try again in a few minutes.",
  },
  not_configured: {
    title: "Sign-in is not set up",
    body: "Sign-in with Spadace Account is not configured for this GeoPlus server.",
  },
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};
