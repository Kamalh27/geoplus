import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const REQUEST_HEADER_NAMES = ["range", "if-none-match", "if-modified-since"] as const;
const RESPONSE_HEADER_NAMES = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "expires",
  "last-modified",
  "vary",
] as const;

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal", ".home.arpa"] as const;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export class ArchiveProxyUrlError extends Error {}

const normalizeHostname = (value: string) => value.trim().toLowerCase().replace(/\.$/, "");

const parseIpv4Address = (value: string) => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return null;
  }

  const octets = value.split(".").map((segment) => Number(segment));
  if (octets.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)) {
    return null;
  }

  return octets;
};

const isPrivateIpv4Address = (value: string) => {
  const octets = parseIpv4Address(value);
  if (!octets) {
    return false;
  }

  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127) {
    return true;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 198 && (second === 18 || second === 19)) {
    return true;
  }
  if (first >= 224) {
    return true;
  }
  return false;
};

const isPrivateIpv6Address = (value: string) => {
  const normalized = value.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4Address(normalized.slice("::ffff:".length));
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (/^fe[89ab]/.test(normalized)) {
    return true;
  }
  return false;
};

const isPrivateIpAddress = (value: string) => {
  if (isPrivateIpv4Address(value)) {
    return true;
  }
  return isPrivateIpv6Address(value);
};

const hasBlockedHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return true;
  }
  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }
  if (!normalized.includes(".") && isIP(normalized) === 0) {
    return true;
  }
  return false;
};

const resolveHostAddresses = async (hostname: string) => {
  if (isIP(hostname) !== 0) {
    return [hostname];
  }

  const records = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  return [...new Set(records.map((record) => record.address))];
};

export const resolveValidatedArchiveUrl = async (
  rawUrl: string,
  resolveAddresses: (hostname: string) => Promise<string[]> = resolveHostAddresses,
) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ArchiveProxyUrlError("Invalid archive URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ArchiveProxyUrlError("Only HTTP(S) archive URLs are supported.");
  }

  if (url.username || url.password) {
    throw new ArchiveProxyUrlError("Archive URLs must not include credentials.");
  }

  const hostname = normalizeHostname(url.hostname);
  if (hasBlockedHostname(hostname)) {
    throw new ArchiveProxyUrlError("Blocked archive host.");
  }

  let resolvedAddresses: string[];
  try {
    resolvedAddresses = await resolveAddresses(hostname);
  } catch {
    throw new ArchiveProxyUrlError("Archive host could not be resolved.");
  }

  if (resolvedAddresses.length === 0 || resolvedAddresses.some((address) => isPrivateIpAddress(address))) {
    throw new ArchiveProxyUrlError("Blocked archive host.");
  }

  return url;
};

const isRedirectResponse = (status: number) => [301, 302, 303, 307, 308].includes(status);

export const fetchValidatedArchiveResponse = async (args: {
  targetUrl: URL;
  method: "GET" | "HEAD";
  headers: Headers;
  resolveAddresses?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}) => {
  const {
    targetUrl,
    method,
    headers,
    resolveAddresses = resolveHostAddresses,
    fetchImpl = fetch,
  } = args;

  let currentUrl = targetUrl;
  let currentMethod = method;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const upstreamResponse = await fetchImpl(currentUrl, {
      method: currentMethod,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!isRedirectResponse(upstreamResponse.status)) {
      return upstreamResponse;
    }

    const location = upstreamResponse.headers.get("location");
    if (!location) {
      return upstreamResponse;
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new ArchiveProxyUrlError("Too many upstream redirects.");
    }

    const nextTargetUrl = await resolveValidatedArchiveUrl(new URL(location, currentUrl).toString(), resolveAddresses);
    currentUrl = nextTargetUrl;

    if (upstreamResponse.status === 303 && currentMethod !== "HEAD") {
      currentMethod = "GET";
    }
  }

  throw new ArchiveProxyUrlError("Too many upstream redirects.");
};

export const getArchiveProxyRequestHeaders = (request: NextRequest) => {
  const headers = new Headers();

  for (const name of REQUEST_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return headers;
};

export const getArchiveProxyResponseHeaders = (response: Response) => {
  const headers = new Headers();

  for (const name of RESPONSE_HEADER_NAMES) {
    const value = response.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }

  return headers;
};
