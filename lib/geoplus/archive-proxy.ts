import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { Agent } from "undici";
import { AUTH_COOKIE_NAME } from "@/lib/geoplus/auth";

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
export const MAX_PROXY_BYTES = 256 * 1024 * 1024;

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

// Parse an IPv6 literal into 8 16-bit groups (handles "::" compression and an embedded IPv4 tail).
const parseIpv6Groups = (value: string): number[] | null => {
  let input = value.toLowerCase().split("%")[0];
  const v4Tail = input.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Tail) {
    const octets = parseIpv4Address(v4Tail[1]);
    if (!octets) {
      return null;
    }
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    input = `${input.slice(0, -v4Tail[1].length)}${hi}:${lo}`;
  }

  const halves = input.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < (halves.length === 2 ? 1 : 0)) {
    return null;
  }
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
};

const isPrivateIpv6Address = (value: string) => {
  const groups = parseIpv6Groups(value);
  if (!groups) {
    // Unparseable literals are never safe to connect to.
    return true;
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::, ::1
  if (firstFiveZero && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) {
    return true;
  }
  // ::ffff:0:0/96 (IPv4-mapped) and ::/96 (IPv4-compatible): judge by the embedded IPv4 address.
  if (firstFiveZero && (g5 === 0xffff || g5 === 0)) {
    return isPrivateIpv4Address(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`);
  }
  // 64:ff9b::/96 (NAT64) can reach internal IPv4 hosts through a translator.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return true;
  }
  // 2002::/16 (6to4) embeds an arbitrary IPv4 address.
  if (g0 === 0x2002) {
    return true;
  }
  // fc00::/7 unique local, fe80::/10 link-local, fec0::/10 site-local, ff00::/8 multicast
  if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0 || (g0 & 0xff00) === 0xff00) {
    return true;
  }
  return false;
};

const isPrivateIpAddress = (value: string) => {
  if (isIP(value) === 4) {
    return isPrivateIpv4Address(value);
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

type ResolveAddresses = (hostname: string) => Promise<string[]>;

const validateArchiveTarget = async (rawUrl: string, resolveAddresses: ResolveAddresses) => {
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

  return { url, addresses: resolvedAddresses };
};

export const resolveValidatedArchiveUrl = async (rawUrl: string, resolveAddresses: ResolveAddresses = resolveHostAddresses) =>
  (await validateArchiveTarget(rawUrl, resolveAddresses)).url;

/**
 * Build an undici dispatcher whose DNS lookup always returns the already-validated address, so the
 * connection cannot be redirected to a different IP by a second (rebinding) DNS answer.
 * TLS SNI and certificate checks still use the original hostname.
 */
export const createPinnedDispatcher = (address: string) => {
  const family = isIP(address) === 6 ? 6 : 4;
  return new Agent({
    keepAliveTimeout: 1_000,
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options && typeof options === "object" && "all" in options && options.all) {
          (callback as unknown as (err: Error | null, addresses: { address: string; family: number }[]) => void)(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      },
    },
  });
};

const isRedirectResponse = (status: number) => [301, 302, 303, 307, 308].includes(status);

export const fetchValidatedArchiveResponse = async (args: {
  targetUrl: URL;
  method: "GET" | "HEAD";
  headers: Headers;
  resolveAddresses?: ResolveAddresses;
  fetchImpl?: typeof fetch;
  /** Override the dispatcher factory (tests). Defaults to an undici Agent pinned to the validated IP. */
  createDispatcher?: (address: string) => unknown;
}) => {
  const {
    targetUrl,
    method,
    headers,
    resolveAddresses = resolveHostAddresses,
    fetchImpl = fetch,
    createDispatcher = createPinnedDispatcher,
  } = args;

  let currentUrl = targetUrl;
  let currentMethod = method;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // Validate and resolve once per hop, then connect to exactly that address.
    const { addresses } = await validateArchiveTarget(currentUrl.toString(), resolveAddresses);
    const dispatcher = createDispatcher(addresses[0]) as { close?: () => Promise<void> } | undefined;

    const upstreamResponse = await fetchImpl(currentUrl, {
      method: currentMethod,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      dispatcher,
    } as RequestInit);

    if (!isRedirectResponse(upstreamResponse.status)) {
      return upstreamResponse;
    }

    const location = upstreamResponse.headers.get("location");
    if (!location) {
      return upstreamResponse;
    }

    void upstreamResponse.body?.cancel().catch(() => undefined);
    void dispatcher?.close?.().catch(() => undefined);

    if (redirectCount === MAX_REDIRECTS) {
      throw new ArchiveProxyUrlError("Too many upstream redirects.");
    }

    currentUrl = new URL(location, currentUrl);

    if (upstreamResponse.status === 303 && currentMethod !== "HEAD") {
      currentMethod = "GET";
    }
  }

  throw new ArchiveProxyUrlError("Too many upstream redirects.");
};

export const hasArchiveProxySession = (request: NextRequest) => Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);

/**
 * Wrap an upstream body so that at most `maxBytes` are forwarded. When the cap is hit the upstream
 * read is cancelled (aborting the connection) and the response stream is ended.
 */
export const limitStreamBytes = (body: ReadableStream<Uint8Array> | null, maxBytes: number = MAX_PROXY_BYTES) => {
  if (!body) {
    return null;
  }
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        total = maxBytes;
        if (remaining > 0) {
          controller.enqueue(value.subarray(0, remaining));
        }
        controller.close();
        await reader.cancel().catch(() => undefined);
        return;
      }
      total += value.byteLength;
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
};

export const isOversizedArchiveResponse = (response: Response, maxBytes: number = MAX_PROXY_BYTES) => {
  const length = Number(response.headers.get("content-length"));
  return Number.isFinite(length) && length > maxBytes;
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
