import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Per-request nonce-based Content-Security-Policy (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * Pages must render dynamically so Next.js can stamp the nonce on its inline/bootstrap scripts.
 *
 * Documented trade-offs:
 *  - connect-src allows any https: origin because GeoPlus lets users load arbitrary remote
 *    geospatial services (COG, PMTiles, WMS/WFS, tile servers) directly from the browser.
 *  - style-src keeps 'unsafe-inline' because MapLibre/deck.gl/Radix set inline style attributes,
 *    which nonces cannot cover. Script execution is what the nonce protects.
 */
export function proxy(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // 'wasm-unsafe-eval' is required for DuckDB-WASM; 'unsafe-eval' only for React dev tooling.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'"];
  if (!isProduction) {
    scriptSrc.push("'unsafe-eval'");
  }

  const connectSrc = isProduction
    ? "connect-src 'self' https:"
    : "connect-src 'self' https: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* http://*.spadace.local:* ws://*.spadace.local:*";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    connectSrc,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
