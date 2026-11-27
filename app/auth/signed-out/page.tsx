import type { Metadata } from "next";
import { connection } from "next/server";

import { getLoginUrl } from "@/lib/geoplus/auth";

export const metadata: Metadata = { title: "Signed out · GeoPlus", robots: { index: false } };

/** The registered sign-out address: Account sends the browser here after ending the sign-in (identity.md 5.3). */
export default async function SignedOutPage() {
  // Dynamic so the CSP nonce from proxy.ts is applied.
  await connection();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">You are signed out</h1>
      <p className="text-sm text-muted-foreground">You have signed out of GeoPlus and Spadace Account.</p>
      {/* A plain link: the login start is a route handler that redirects to Account. */}
      <a href={getLoginUrl("/")} className="text-sm font-medium text-accent hover:underline">
        Sign in again
      </a>
    </main>
  );
}
