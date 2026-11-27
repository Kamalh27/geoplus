import { NextResponse, type NextRequest } from "next/server";

import { authErrorPath, resolveNextUrl, type AuthErrorCode } from "@/lib/geoplus/auth";
import {
  AccountUnavailableError,
  finishSignIn,
  loadAccountConfig,
  loginCookie,
  loginCookieName,
  sealSession,
  sessionCookie,
  signInDeps,
  unsealPending,
  type AccountSession,
} from "@/lib/server/account-session";

/**
 * The registered return address (`http://localhost:3001/auth/callback` for `geoplus-web-dev`). Checks `state`
 * against this browser's login cookie, exchanges the code, checks the ID token, and stores the Account tokens in
 * the sealed session cookie. Refusals go to `/auth/error` with a fixed code; nothing is logged.
 */
export async function GET(request: NextRequest) {
  const config = loadAccountConfig();
  if (!config) {
    return NextResponse.redirect(new URL(authErrorPath("not_configured"), request.nextUrl), 303);
  }
  const base = new URL(config.redirectUri);
  const query = request.nextUrl.searchParams;
  const pending = unsealPending(config, request.cookies.get(loginCookieName(config))?.value);

  let session: AccountSession | null = null;
  let sealed: string | null = null;
  let refusal: AuthErrorCode | null = null;
  if (!pending) {
    refusal = "sign_in_failed";
  } else {
    try {
      session = await finishSignIn(
        config,
        pending,
        { code: query.get("code"), state: query.get("state"), error: query.get("error") },
        signInDeps(config),
      );
      sealed = sealSession(config, session);
    } catch (error) {
      refusal = error instanceof AccountUnavailableError ? "account_unavailable" : "sign_in_failed";
    }
  }

  // `next` was sanitised at login start; it is checked again here and must stay on the return address's origin.
  const target = refusal || !pending ? new URL(authErrorPath(refusal ?? "sign_in_failed"), base) : resolveNextUrl(pending.next, base);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  const clearLogin = loginCookie(config, null);
  response.cookies.set(clearLogin.name, clearLogin.value, clearLogin.options);
  if (session && sealed && !refusal) {
    const cookie = sessionCookie(config, sealed, session.signedInAt, session.signedInAt);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
