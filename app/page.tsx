import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeoPlusShell } from "@/components/geoplus-shell";
import { loadAccountConfig, nowSeconds, sessionCookieName, sessionUser, unsealSession } from "@/lib/server/account-session";
import { coreBackendUrl, fetchCoreWithCurrentSession } from "@/lib/server/core-proxy";
import type { GeoPlusLayerItem, GeoPlusUser } from "@/components/geoplus/types";

export const metadata: Metadata = {
  title: "GeoPlus",
  description: "GeoPlus standalone geospatial workspace powered by MapLibre GL JS.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "GeoPlus",
    description: "GeoPlus standalone geospatial workspace powered by MapLibre GL JS.",
    url: "https://geoplus.spadace.com",
  },
};

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type ProjectPayload = {
  name?: string | null;
};

function normalizeParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Identifiers are interpolated into backend URL paths; only allow a conservative charset.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function normalizeIdentifierParam(value: string | string[] | undefined): string | null {
  const normalized = normalizeParam(value);
  return normalized && SAFE_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}

/**
 * The person signed in to GeoPlus through Spadace Account (sealed session cookie, P3-b3): profile fields from the
 * checked ID token, read without a network call.
 */
async function getAuthenticatedUser(sealedSession: string | undefined): Promise<GeoPlusUser | null> {
  const config = loadAccountConfig();
  if (!config) return null;
  const session = unsealSession(config, sealedSession);
  if (!session) return null;
  const user = sessionUser(session);
  return { id: user.id, name: user.name || user.email || "Signed-in user", email: user.email };
}

/**
 * A GET to core for this page's first paint, with the session's access token as it is (P3-b4). A page cannot write
 * the renewed session cookie, so it never renews: with no usable token this answers null and the browser loads the
 * same data through `/api/core`, which renews. `allowAnonymous` is for public dashboards.
 */
async function coreGet(sealedSession: string | undefined, path: string, allowAnonymous = false): Promise<Response | null> {
  const config = loadAccountConfig();
  const base = coreBackendUrl();
  if (config && sealedSession) {
    const response = await fetchCoreWithCurrentSession(config, sealedSession, path, {}, { fetch, now: nowSeconds, coreBaseUrl: base });
    if (response) return response;
  }
  if (!allowAnonymous) return null;
  try {
    return await fetch(`${base}${path}`, { cache: "no-store", redirect: "error" });
  } catch {
    return null;
  }
}

export default async function GeoPlusPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dashboardId = normalizeIdentifierParam(sp.id);
  const publicDashboard = normalizeParam(sp.public) === "1";
  const requestedProjectUid = normalizeIdentifierParam(sp.project_uid);
  const config = loadAccountConfig();
  const cookieStore = await cookies();
  const sealedSession = config ? cookieStore.get(sessionCookieName(config))?.value : undefined;

  const [user, dashboardPayload] = await Promise.all([
    getAuthenticatedUser(sealedSession),
    (async () => {
      if (!dashboardId) return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };
      if (!sealedSession && !publicDashboard) return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };

      try {
        const endpoint = publicDashboard
          ? `/api/v1/geoplus/dashboards/${encodeURIComponent(dashboardId)}/public`
          : `/api/v1/geoplus/dashboards/${encodeURIComponent(dashboardId)}`;
        const response = await coreGet(sealedSession, endpoint, publicDashboard);
        if (!response) {
          return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };
        }
        if (response.ok) {
          const data = await response.json() as Partial<{
            layers: GeoPlusLayerItem[];
            project_uid: string | null;
          }>;
          return {
            layers: Array.isArray(data.layers) ? data.layers : [],
            projectUid: typeof data.project_uid === "string" && data.project_uid.trim() ? data.project_uid.trim() : null,
          };
        }
        if (response.status === 401) {
          return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };
        }
        console.error(`Failed to fetch dashboard ${dashboardId}: ${response.statusText}`);
      } catch (error) {
        console.error(`Error fetching dashboard ${dashboardId}:`, error);
      }
      return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };
    })()
  ]);

  const resolvedProjectUid = requestedProjectUid ?? dashboardPayload.projectUid;
  const resolvedProjectName = await (async () => {
    if (!resolvedProjectUid || !sealedSession) {
      return null;
    }

    try {
      const response = await coreGet(sealedSession, `/api/v1/projects/${encodeURIComponent(resolvedProjectUid)}`);

      if (!response || !response.ok) {
        return null;
      }

      const data = await response.json() as ProjectPayload;
      return typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
    } catch (error) {
      console.error(`Error fetching project ${resolvedProjectUid}:`, error);
      return null;
    }
  })();
  const initialLayers = dashboardPayload.layers;

  return (
    <GeoPlusShell
      initialDashboardId={dashboardId}
      initialLayers={initialLayers}
      initialUser={user}
      initialProjectUid={resolvedProjectUid}
      initialProjectName={resolvedProjectName}
    />
  );
}
