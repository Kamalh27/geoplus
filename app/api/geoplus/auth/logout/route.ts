import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLogoutCookieOptions, resolveSafeNextUrl } from "@/lib/geoplus/logout";

export async function GET(request: NextRequest) {
  // Only same-origin redirects are honoured; anything else falls back to "/".
  const redirectUrl = resolveSafeNextUrl(request.nextUrl.searchParams.get("next"), request.nextUrl);
  const response = NextResponse.redirect(redirectUrl);

  // Clear the Spadace authentication cookies. Max-Age 0 instructs the browser to delete them.
  // The domain must match what the core backend sets (AUTH_COOKIE_DOMAIN; host-only when unset).
  const cookieOptions = getLogoutCookieOptions(process.env);

  response.cookies.set("access_token", "", cookieOptions);
  response.cookies.set("refresh_token", "", cookieOptions);
  response.cookies.set("tenant_uid", "", cookieOptions);
  response.cookies.set("tenant_slug", "", cookieOptions);

  return response;
}
