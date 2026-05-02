import type { NextRequest } from "next/server";

import { SearchProxyError, fetchNominatimSearchResults } from "@/lib/geoplus/search-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await fetchNominatimSearchResults({
      query,
      acceptLanguage: request.headers.get("accept-language"),
    });

    return Response.json(results, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    if (error instanceof SearchProxyError) {
      return Response.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    }

    return Response.json(
      {
        error: "Search is temporarily unavailable.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  }
}
