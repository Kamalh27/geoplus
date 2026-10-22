import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeoPlusShell } from "@/components/geoplus-shell";
import { CORE_BACKEND_URL } from "@/lib/geoplus/dashboard-storage";
import { CORE_AUTH_ME_ENDPOINT, AUTH_COOKIE_NAME } from "@/lib/geoplus/auth";
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

async function getAuthenticatedUser(): Promise<GeoPlusUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  try {
    const response = await fetch(CORE_AUTH_ME_ENDPOINT, {
      headers: {
        "Cookie": `${AUTH_COOKIE_NAME}=${sessionToken}`,
      },
      cache: "no-store",
    });

    if (response.ok) {
      const userData = await response.json() as Partial<{
        user_id: string | number;
        id: string | number;
        uid: string;
        name: string;
        email: string;
        profile_image_url: string;
        avatarUrl: string;
        tenant_id: number;
      }>;
      return {
        id: userData.user_id?.toString() || userData.id?.toString() || userData.uid || "unknown-id",
        name: userData.name || "Unknown User",
        email: userData.email || "",
        avatarUrl: userData.profile_image_url || userData.avatarUrl,
        tenantId: typeof userData.tenant_id === "number" ? userData.tenant_id : undefined,
      };
    }
  } catch (error) {
    console.error("Failed to fetch authenticated user:", error);
  }

  return null;
}

export default async function GeoPlusPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dashboardId = normalizeParam(sp.id);
  const publicDashboard = normalizeParam(sp.public) === "1";
  const requestedProjectUid = normalizeParam(sp.project_uid);
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  const [user, dashboardPayload] = await Promise.all([
    getAuthenticatedUser(),
    (async () => {
      if (!dashboardId) return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };
      if (!sessionToken && !publicDashboard) return { layers: [] as GeoPlusLayerItem[], projectUid: null as string | null };

      try {
        const endpoint = publicDashboard
          ? `${CORE_BACKEND_URL}/api/v1/geoplus/dashboards/${dashboardId}/public`
          : `${CORE_BACKEND_URL}/api/v1/geoplus/dashboards/${dashboardId}`;
        const response = await fetch(endpoint, { 
          cache: "no-store",
          headers: sessionToken ? { "Cookie": `${AUTH_COOKIE_NAME}=${sessionToken}` } : undefined,
        });
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
    if (!resolvedProjectUid || !sessionToken) {
      return null;
    }

    try {
      const response = await fetch(`${CORE_BACKEND_URL}/api/v1/projects/${resolvedProjectUid}`, {
        cache: "no-store",
        headers: { "Cookie": `${AUTH_COOKIE_NAME}=${sessionToken}` },
      });

      if (!response.ok) {
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
