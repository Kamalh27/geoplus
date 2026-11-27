import type { Metadata } from "next";
import Link from "next/link";

import { AUTH_ERROR_MESSAGES, getLoginUrl, parseAuthErrorCode } from "@/lib/geoplus/auth";

export const metadata: Metadata = { title: "Sign-in · GeoPlus", robots: { index: false } };

type PageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

/** A sign-in that did not finish. Only fixed text is shown; nothing from the URL is rendered. */
export default async function AuthErrorPage({ searchParams }: PageProps) {
  const code = parseAuthErrorCode((await searchParams).code);
  const message = AUTH_ERROR_MESSAGES[code];
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">{message.title}</h1>
      <p className="text-sm text-muted-foreground">{message.body}</p>
      {code !== "not_configured" ? (
        <a href={getLoginUrl("/")} className="text-sm font-medium text-accent hover:underline">
          Try again
        </a>
      ) : null}
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        Back to GeoPlus
      </Link>
    </main>
  );
}
