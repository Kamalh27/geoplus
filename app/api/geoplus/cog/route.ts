import type { NextRequest } from "next/server";
import {
  ArchiveProxyUrlError,
  fetchValidatedArchiveResponse,
  getArchiveProxyRequestHeaders,
  getArchiveProxyResponseHeaders,
  resolveValidatedArchiveUrl,
} from "@/lib/geoplus/archive-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxyCogArchive = async (request: NextRequest, method: "GET" | "HEAD") => {
  const rawTargetUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawTargetUrl) {
    return new Response("Invalid COG URL.", { status: 400 });
  }

  try {
    const targetUrl = await resolveValidatedArchiveUrl(rawTargetUrl);
    const upstreamResponse = await fetchValidatedArchiveResponse({
      targetUrl,
      method,
      headers: getArchiveProxyRequestHeaders(request),
    });

    return new Response(method === "HEAD" ? null : upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: getArchiveProxyResponseHeaders(upstreamResponse),
    });
  } catch (error) {
    if (error instanceof ArchiveProxyUrlError) {
      return new Response("Blocked COG URL.", { status: 400 });
    }

    return new Response("Failed to fetch COG archive.", { status: 502 });
  }
};

export const GET = (request: NextRequest) => proxyCogArchive(request, "GET");

export const HEAD = (request: NextRequest) => proxyCogArchive(request, "HEAD");
