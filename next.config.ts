import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      worker_threads: "./lib/empty.ts",
      fs: "./lib/empty.ts",
      path: "./lib/empty.ts",
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        worker_threads: false,
        fs: false,
        path: false,
      };
    }
    return config;
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    // DuckDB-WASM requires WebAssembly compilation permission under CSP.
    const scriptSrcParts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
    if (!isProduction) {
      scriptSrcParts.push("'unsafe-eval'");
    }
    const scriptSrc = `script-src ${scriptSrcParts.join(" ")}`;
    // GeoPlus lets users connect to arbitrary remote geospatial services, so CSP must
    // allow outbound fetches beyond a fixed vendor allowlist.
    const connectSrc = isProduction
      ? "connect-src 'self' https:"
      : "connect-src 'self' https: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*";

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      scriptSrc,
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      connectSrc,
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
