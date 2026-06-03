import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // Extract the ?next parameter, defaulting to the homepage if not provided.
  const searchParams = request.nextUrl.searchParams;
  const nextUrl = searchParams.get("next") || "/";

  // Create the redirect response
  const response = NextResponse.redirect(new URL(nextUrl, request.url));

  // Clear the Spadace authentication cookies. We set Max-Age to 0 to instruct the browser to delete them.
  // We need to match the domain path configuration used by the backend.
  const cookieOptions = {
    path: "/",
    domain: ".spadace.local", // Match the domain the backend sets
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
  };

  response.cookies.set("access_token", "", cookieOptions);
  response.cookies.set("refresh_token", "", cookieOptions);
  response.cookies.set("tenant_uid", "", cookieOptions);
  response.cookies.set("tenant_slug", "", cookieOptions);

  return response;
}
