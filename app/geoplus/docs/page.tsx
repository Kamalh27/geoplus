import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_USER_MANUAL_MARKDOWN } from "@/lib/geoplus/docs";

export const metadata: Metadata = {
  title: "GeoPlus Docs",
  description: "GeoPlus user manual and documentation.",
  alternates: {
    canonical: "/geoplus/docs",
  },
  openGraph: {
    title: "GeoPlus Docs",
    description: "GeoPlus user manual and documentation.",
    url: "https://geoplus.spadace.com/geoplus/docs",
  },
};

export default function GeoPlusDocsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">GeoPlus Docs</h1>
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            Back to Workspace
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Dedicated documentation page for GeoPlus manual content.</p>

        <div className="mt-5 rounded-xl border border-border/70 bg-muted/35 p-3 sm:p-4">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-sm leading-7 text-foreground">
            {DRAFT_USER_MANUAL_MARKDOWN}
          </pre>
        </div>
      </div>
    </main>
  );
}
