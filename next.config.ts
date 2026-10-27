import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next/image is only used for local/blob/data sources, so the optimizer (and sharp) is unnecessary.
  images: { unoptimized: true },
  allowedDevOrigins: ["geoplus.spadace.local"],
  turbopack: {
    resolveAlias: {
      // Browser bundles only: maplibre-gl 6 uses the real worker_threads when its module is
      // evaluated during SSR, and an empty stub there throws on import.
      worker_threads: { browser: "./lib/empty.ts" },
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
  // The Content-Security-Policy is set per request (with a nonce) in proxy.ts.
  async headers() {
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
        ],
      },
    ];
  },
};

export default nextConfig;
