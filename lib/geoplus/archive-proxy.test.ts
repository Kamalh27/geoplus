import assert from "node:assert/strict";
import test from "node:test";

import { ArchiveProxyUrlError, fetchValidatedArchiveResponse, resolveValidatedArchiveUrl } from "./archive-proxy.ts";

test("resolveValidatedArchiveUrl accepts public HTTPS hosts", async () => {
  const url = await resolveValidatedArchiveUrl("https://tiles.example.com/archive.pmtiles", async () => ["93.184.216.34"]);

  assert.equal(url.hostname, "tiles.example.com");
  assert.equal(url.protocol, "https:");
});

test("resolveValidatedArchiveUrl rejects private and local targets", async () => {
  const blockedUrls = [
    "https://localhost/archive.pmtiles",
    "https://127.0.0.1/archive.pmtiles",
    "https://10.0.0.5/archive.pmtiles",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://tiles.internal/archive.pmtiles",
  ];

  for (const blockedUrl of blockedUrls) {
    await assert.rejects(resolveValidatedArchiveUrl(blockedUrl), ArchiveProxyUrlError);
  }
});

test("resolveValidatedArchiveUrl rejects embedded credentials", async () => {
  await assert.rejects(
    resolveValidatedArchiveUrl("https://user:secret@example.com/archive.pmtiles", async () => ["93.184.216.34"]),
    ArchiveProxyUrlError,
  );
});

test("fetchValidatedArchiveResponse follows safe redirects", async () => {
  const requestedUrls: string[] = [];

  const response = await fetchValidatedArchiveResponse({
    targetUrl: new URL("https://tiles.example.com/archive.pmtiles"),
    method: "GET",
    headers: new Headers([["range", "bytes=0-1023"]]),
    resolveAddresses: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      requestedUrls.push(String(input));

      if (requestedUrls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: {
            location: "/redirected/archive.pmtiles",
          },
        });
      }

      return new Response("ok", {
        status: 206,
        headers: {
          "content-type": "application/octet-stream",
        },
      });
    },
  });

  assert.equal(requestedUrls[0], "https://tiles.example.com/archive.pmtiles");
  assert.equal(requestedUrls[1], "https://tiles.example.com/redirected/archive.pmtiles");
  assert.equal(response.status, 206);
});

test("fetchValidatedArchiveResponse rejects unsafe redirects", async () => {
  let requestCount = 0;

  await assert.rejects(
    fetchValidatedArchiveResponse({
      targetUrl: new URL("https://tiles.example.com/archive.pmtiles"),
      method: "GET",
      headers: new Headers(),
      resolveAddresses: async (hostname) => (hostname === "tiles.example.com" ? ["93.184.216.34"] : ["127.0.0.1"]),
      fetchImpl: async () => {
        requestCount += 1;
        return new Response(null, {
          status: 302,
          headers: {
            location: "http://127.0.0.1/admin",
          },
        });
      },
    }),
    ArchiveProxyUrlError,
  );

  assert.equal(requestCount, 1);
});
