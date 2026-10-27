import Link from "next/link";
import { connection } from "next/server";

export default async function NotFound() {
  // Dynamic so the CSP nonce from proxy.ts is applied to the 404 page too.
  await connection();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">
        Back to Workspace
      </Link>
    </main>
  );
}
