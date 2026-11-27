import assert from "node:assert/strict";
import test from "node:test";

import { coreApiUrl, coreFetch } from "./core-api.ts";

test("coreApiUrl maps /api/v1 paths onto the same-origin proxy", () => {
  assert.equal(coreApiUrl("/api/v1/projects?limit=200&offset=0"), "/api/core/api/v1/projects?limit=200&offset=0");
  assert.equal(coreApiUrl("/api/v1/geoplus/dashboards/abc"), "/api/core/api/v1/geoplus/dashboards/abc");
});

test("coreApiUrl refuses anything else", () => {
  for (const path of ["/static/uploads/x.zip", "api/v1/x", "https://evil.test/api/v1/x", "//evil.test/api/v1/x", "/api/v1\\x", "/healthz"]) {
    assert.throws(() => coreApiUrl(path), path);
  }
});

test("coreFetch sends same-origin credentials and never lets a caller widen them", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response("{}");
  }) as typeof fetch;
  try {
    await coreFetch("/api/v1/layers", { method: "POST", credentials: "include" });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls[0].url, "/api/core/api/v1/layers");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.method, "POST");
});
