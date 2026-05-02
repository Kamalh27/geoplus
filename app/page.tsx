import type { Metadata } from "next";

import { GeoPlusShell } from "@/components/geoplus-shell";

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

export default function GeoPlusPage() {
  return <GeoPlusShell />;
}
