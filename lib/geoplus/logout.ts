/**
 * Resolve the `?next=` logout redirect target. Only same-origin targets are honoured so the
 * endpoint cannot be used as an open redirect; everything else falls back to the homepage.
 */
export const resolveSafeNextUrl = (next: string | null | undefined, requestUrl: URL): URL => {
  const fallback = new URL("/", requestUrl);
  const candidate = next?.trim();
  if (!candidate) {
    return fallback;
  }
  // Protocol-relative ("//evil.com") and backslash variants ("/\evil.com") must never be trusted.
  if (/^[\\/]{2}/.test(candidate) || candidate.includes("\\")) {
    return fallback;
  }

  let resolved: URL;
  try {
    resolved = new URL(candidate, requestUrl);
  } catch {
    return fallback;
  }

  if (resolved.origin !== requestUrl.origin) {
    return fallback;
  }
  if (!resolved.pathname.startsWith("/") || resolved.pathname.startsWith("//")) {
    return fallback;
  }
  return resolved;
};
