import type { Metadata } from "next";
import { GeoPlusShell } from "@/components/geoplus-shell";
import { CORE_BACKEND_URL } from "@/lib/geoplus/dashboard-storage";
import type { GeoPlusLayerItem } from "@/components/geoplus/types";

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

export default async function GeoPlusPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dashboardId = sp.id as string | undefined;

  let initialLayers: GeoPlusLayerItem[] = [];

  if (dashboardId) {
    try {
      const response = await fetch(`${CORE_BACKEND_URL}/api/v1/geoplus/dashboards/${dashboardId}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data.layers) {
          initialLayers = data.layers;
        }
      } else {
        console.error(`Failed to fetch dashboard ${dashboardId}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error fetching dashboard ${dashboardId}:`, error);
    }
  }

  return <GeoPlusShell initialLayers={initialLayers} />;
}
