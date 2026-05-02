import assert from "node:assert/strict";
import test from "node:test";

import {
  SearchProxyError,
  buildNominatimSearchUrl,
  buildSearchRequestHeaders,
  fetchNominatimSearchResults,
  normalizeSearchResults,
  validateSearchQuery,
} from "./search-proxy.ts";

test("validateSearchQuery trims and normalizes whitespace", () => {
  assert.equal(validateSearchQuery("  dhaka   bangladesh "), "dhaka bangladesh");
});

test("validateSearchQuery rejects too-short and too-long queries", () => {
  assert.throws(() => validateSearchQuery("a"), SearchProxyError);
  assert.throws(() => validateSearchQuery("x".repeat(121)), SearchProxyError);
});

test("buildNominatimSearchUrl encodes the validated query", () => {
  const url = buildNominatimSearchUrl("new york");

  assert.equal(url.hostname, "nominatim.openstreetmap.org");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal(url.searchParams.get("q"), "new york");
});

test("buildSearchRequestHeaders includes app identity and language", () => {
  const headers = buildSearchRequestHeaders("en-US,en;q=0.9");

  assert.match(headers.get("user-agent") ?? "", /^GeoPlus\//);
  assert.equal(headers.get("accept-language"), "en-US,en;q=0.9");
  assert.equal(headers.get("referer"), "https://geoplus.spadace.com");
});

test("normalizeSearchResults keeps only valid entries", () => {
  const results = normalizeSearchResults([
    { display_name: "Dhaka", lat: "23.8103", lon: "90.4125" },
    { display_name: "Broken", lat: 23.8, lon: "90.4" },
  ]);

  assert.deepEqual(results, [{ display_name: "Dhaka", lat: "23.8103", lon: "90.4125" }]);
});

test("fetchNominatimSearchResults returns validated results", async () => {
  const results = await fetchNominatimSearchResults({
    query: "dhaka",
    acceptLanguage: "en",
    fetchImpl: async () =>
      new Response(JSON.stringify([{ display_name: "Dhaka", lat: "23.8103", lon: "90.4125" }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.display_name, "Dhaka");
});

test("fetchNominatimSearchResults maps upstream failures to stable errors", async () => {
  await assert.rejects(
    fetchNominatimSearchResults({
      query: "dhaka",
      acceptLanguage: null,
      fetchImpl: async () => new Response("busy", { status: 429 }),
    }),
    (error: unknown) => error instanceof SearchProxyError && error.status === 503,
  );
});
