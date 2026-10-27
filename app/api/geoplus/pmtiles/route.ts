import type { NextRequest } from "next/server";
import {
  ArchiveProxyUrlError,
  fetchValidatedArchiveResponse,
  getArchiveProxyRequestHeaders,
  getArchiveProxyResponseHeaders,
  hasArchiveProxySession,
  isOversizedArchiveResponse,
  limitStreamBytes,
  resolveValidatedArchiveUrl,
} from "@/lib/geoplus/archive-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxyPmtilesArchive = async (request: NextRequest, method: "GET" | "HEAD") => {
  if (!hasArchiveProxySession(request)) {
    return new Response("Authentication required.", { status: 401 });
  }

  const rawTargetUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawTargetUrl) {
    return new Response("Invalid PMTiles URL.", { status: 400 });
  }

  try {
    const targetUrl = await resolveValidatedArchiveUrl(rawTargetUrl);
    const upstreamResponse = await fetchValidatedArchiveResponse({
      targetUrl,
      method,
      headers: getArchiveProxyRequestHeaders(request),
    });

    if (isOversizedArchiveResponse(upstreamResponse)) {
      void upstreamResponse.body?.cancel().catch(() => undefined);
      return new Response("Archive response too large.", { status: 413 });
    }

    return new Response(method === "HEAD" ? null : limitStreamBytes(upstreamResponse.body), {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: getArchiveProxyResponseHeaders(upstreamResponse),
    });
  } catch (error) {
    if (error instanceof ArchiveProxyUrlError) {
      return new Response("Blocked PMTiles URL.", { status: 400 });
    }

    return new Response("Failed to fetch PMTiles archive.", { status: 502 });
  }
};

export const GET = (request: NextRequest) => proxyPmtilesArchive(request, "GET");

export const HEAD = (request: NextRequest) => proxyPmtilesArchive(request, "HEAD");
