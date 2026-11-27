import { NextResponse, type NextRequest } from "next/server";

import { SIGNED_OUT_PATH } from "@/lib/geoplus/auth";
import { getLogoutCookieOptions } from "@/lib/geoplus/logout";
import {
  endSessionUrl,
  isSameOriginRequest,
  loadAccountConfig,
  nowSeconds,
  randomState,
  revokeRefreshToken,
  sessionCookie,
  sessionCookieName,
  unsealSession,
} from "@/lib/server/account-session";

/**
 * Sign-out (identity.md 5.3): `POST` only, same-origin only (ID-29). Revokes the refresh token, clears the sealed
 * session cookie (and core's old cookies, still read until P3-b4), and answers `{ redirect_to }`: Account's
 * end-session address, which returns the browser to `/auth/signed-out`.
 */
export async function POST(request: NextRequest) {
  const config = loadAccountConfig();
  const allowed = [request.nextUrl.origin];
  if (config) allowed.push(new URL(config.redirectUri).origin);
  if (!isSameOriginRequest(request.headers, allowed)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let redirectTo = SIGNED_OUT_PATH;
  const session = config ? unsealSession(config, request.cookies.get(sessionCookieName(config))?.value) : null;
  if (config) {
    if (session) await revokeRefreshToken(config, session.refreshToken, fetch);
    redirectTo = endSessionUrl(config, session?.idToken ?? null, randomState());
  }

  const response = NextResponse.json({ redirect_to: redirectTo }, { headers: { "Cache-Control": "no-store" } });
  if (config) {
    const cleared = sessionCookie(config, null, nowSeconds(), nowSeconds());
    response.cookies.set(cleared.name, cleared.value, cleared.options);
  }

  // Core's old shared cookies (transitional; the domain must match what core sets, host-only when unset).
  const legacy = getLogoutCookieOptions(process.env);
  for (const name of ["access_token", "refresh_token", "tenant_uid", "tenant_slug"]) {
    response.cookies.set(name, "", legacy);
  }

  return response;
}
