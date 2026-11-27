import { NextResponse, type NextRequest } from "next/server";

import { authErrorPath } from "@/lib/geoplus/auth";
import { beginSignIn, loadAccountConfig, loginCookie, nowSeconds, seal } from "@/lib/server/account-session";

/**
 * Starts sign-in through Spadace Account (identity.md 5.1 step 1): the PKCE verifier, `state` and `nonce` go into
 * a sealed, HttpOnly login cookie for 10 minutes, and the browser goes to Account's authorise address.
 */
export async function GET(request: NextRequest) {
  const config = loadAccountConfig();
  if (!config) {
    return NextResponse.redirect(new URL(authErrorPath("not_configured"), request.nextUrl), 303);
  }
  const query = request.nextUrl.searchParams;
  const { url, pending } = beginSignIn(
    config,
    { next: query.get("next"), organisation: query.get("organisation") },
    nowSeconds(),
  );
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  const cookie = loginCookie(config, seal(pending, "login", config.keys));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
