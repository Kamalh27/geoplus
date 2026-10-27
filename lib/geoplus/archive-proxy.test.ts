import assert from "node:assert/strict";
import test from "node:test";

import {
  ArchiveProxyUrlError,
  fetchValidatedArchiveResponse,
  isOversizedArchiveResponse,
  limitStreamBytes,
  resolveValidatedArchiveUrl,
} from "./archive-proxy.ts";

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

test("resolveValidatedArchiveUrl blocks NAT64, 6to4 and mapped IPv6 answers", async () => {
  const blocked = [
    "64:ff9b::7f00:1",
    "64:ff9b:0:0:0:0:a00:1",
    "2002:7f00:1::1",
    "2002::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fd00::1",
    "fe80::1",
    "::1",
  ];
  for (const address of blocked) {
    await assert.rejects(
      resolveValidatedArchiveUrl("https://tiles.example.com/a.pmtiles", async () => [address]),
      ArchiveProxyUrlError,
      address,
    );
  }
  const url = await resolveValidatedArchiveUrl("https://tiles.example.com/a.pmtiles", async () => ["2606:4700:4700::1111"]);
  assert.equal(url.hostname, "tiles.example.com");
});

test("fetchValidatedArchiveResponse pins the connection to the validated address on every hop", async () => {
  const pinned: string[] = [];
  const dispatchers: unknown[] = [];
  let resolveCalls = 0;

  await fetchValidatedArchiveResponse({
    targetUrl: new URL("https://tiles.example.com/a.pmtiles"),
    method: "GET",
    headers: new Headers(),
    // A rebinding resolver: first answer is public, later answers would be internal.
    resolveAddresses: async () => {
      resolveCalls += 1;
      return resolveCalls === 1 ? ["93.184.216.34"] : ["10.0.0.1"];
    },
    createDispatcher: (address) => {
      pinned.push(address);
      const dispatcher = { address };
      dispatchers.push(dispatcher);
      return dispatcher;
    },
    fetchImpl: async (_input, init) => {
      assert.equal((init as { dispatcher?: unknown }).dispatcher, dispatchers[dispatchers.length - 1]);
      return new Response("ok", { status: 200 });
    },
  });

  assert.deepEqual(pinned, ["93.184.216.34"]);
  assert.equal(resolveCalls, 1);
});

test("limitStreamBytes truncates at the cap and cancels the upstream", async () => {
  let cancelled = false;
  const upstream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(40));
    },
    cancel() {
      cancelled = true;
    },
  });

  const limited = limitStreamBytes(upstream, 100);
  assert.ok(limited);
  let received = 0;
  const reader = limited.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
  }
  assert.equal(received, 100);
  assert.equal(cancelled, true);
});

test("isOversizedArchiveResponse checks content-length against the cap", () => {
  assert.equal(isOversizedArchiveResponse(new Response("x", { headers: { "content-length": "300" } }), 256), true);
  assert.equal(isOversizedArchiveResponse(new Response("x", { headers: { "content-length": "10" } }), 256), false);
  assert.equal(isOversizedArchiveResponse(new Response("x"), 256), false);
});
