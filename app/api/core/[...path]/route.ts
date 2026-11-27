import type { NextRequest } from "next/server";

import { freshSessionDeps, loadAccountConfig, type AccountClientConfig } from "@/lib/server/account-session";
import { coreBackendUrl, proxyCoreRequest } from "@/lib/server/core-proxy";

/**
 * Same-origin proxy to core's `/api/v1/...` (plan P3-b4). The browser calls `/api/core/api/v1/...`; this adds the
 * Account bearer token from the sealed session cookie. Logic and tests: `lib/server/core-proxy.ts`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest): Promise<Response> {
  let config: AccountClientConfig | null = null;
  try {
    config = loadAccountConfig();
  } catch {
    // A production misconfiguration: answer "not configured" below, never the error text.
  }
  const allowedOrigins = [request.nextUrl.origin];
  if (config) allowedOrigins.push(new URL(config.redirectUri).origin);
  return proxyCoreRequest(request, {
    config,
    deps: freshSessionDeps(),
    coreBaseUrl: coreBackendUrl(),
    allowedOrigins,
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
