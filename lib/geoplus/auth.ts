/**
 * Authentication configuration for GeoPlus.
 * These settings allow sharing sessions with the Spadace Core platform.
 */

export const AUTH_COOKIE_NAME = "access_token";

// Backend URL is already defined in dashboard-storage, but we might want a cleaner way to manage it.
import { CORE_BACKEND_URL } from "./dashboard-storage";

export const CORE_AUTH_ME_ENDPOINT = `${CORE_BACKEND_URL}/api/v1/users/me`;

/**
 * The frontend URL for the core platform, used for login/logout redirects.
 * Local: http://app.spadace.local:3000 (requires /etc/hosts configuration)
 * Production: https://app.spadace.com
 */
const DEFAULT_CORE_FRONTEND_URL = "http://app.spadace.local:3000";

function normalizeAbsoluteUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`http://${trimmed}`).toString();
    } catch {
      return null;
    }
  }
}

function inferCoreFrontendUrl(currentHref: string): string | null {
  try {
    const current = new URL(currentHref);
    const protocol = current.protocol === "https:" ? "https:" : "http:";
    const { hostname } = current;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:3000`;
    }
    if (hostname.startsWith("geoplus.")) {
      return `${protocol}//app.${hostname.slice("geoplus.".length)}:3000`;
    }
  } catch {
    // Ignore malformed current URLs.
  }
  return null;
}

function resolveCoreFrontendUrl(currentHref?: string): string {
  const configured = normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_CORE_URL ?? "");
  if (configured) return configured;

  if (typeof currentHref === "string") {
    const inferred = inferCoreFrontendUrl(currentHref);
    if (inferred) return inferred;
  }

  if (typeof window !== "undefined") {
    const inferred = inferCoreFrontendUrl(window.location.href);
    if (inferred) return inferred;
  }

  return DEFAULT_CORE_FRONTEND_URL;
}

export const CORE_FRONTEND_URL =
  normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_CORE_URL ?? "") ??
  DEFAULT_CORE_FRONTEND_URL;

export const getLoginUrl = (redirectTo?: string) => {
  const url = new URL("/login", resolveCoreFrontendUrl(redirectTo));
  if (redirectTo) {
    url.searchParams.set("next", redirectTo);
  }
  return url.toString();
};

export const getLogoutUrl = (redirectTo?: string) => {
  const url = new URL("/api/geoplus/auth/logout", typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  if (redirectTo) {
    url.searchParams.set("next", redirectTo);
  }
  return url.toString();
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};
