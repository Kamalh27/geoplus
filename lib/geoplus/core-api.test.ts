import assert from "node:assert/strict";
import test from "node:test";

import { coreApiUrl, coreFetch, handleSignedOut, resolveSignInTarget, SIGN_IN_REDIRECT_COOLDOWN_MS, type RedirectGuard } from "./core-api.ts";

const here = { pathname: "/", search: "?id=abc" };

test("coreApiUrl maps /api/v1 paths onto the same-origin proxy", () => {
  assert.equal(coreApiUrl("/api/v1/projects?limit=200&offset=0"), "/api/core/api/v1/projects?limit=200&offset=0");
  assert.equal(coreApiUrl("/api/v1/geoplus/dashboards/abc"), "/api/core/api/v1/geoplus/dashboards/abc");
});

test("coreApiUrl refuses anything else", () => {
  for (const path of ["/static/uploads/x.zip", "api/v1/x", "https://evil.test/api/v1/x", "//evil.test/api/v1/x", "/api/v1\\x", "/healthz"]) {
    assert.throws(() => coreApiUrl(path), path);
  }
});

test("resolveSignInTarget takes the server's login_url, re-sanitised; anything odd falls back to this page", () => {
  const own = "/api/geoplus/auth/login?next=%2F%3Fid%3Dabc";
  assert.equal(resolveSignInTarget({ error: "signed_out", login_url: own }, here), own);
  const fallback = "/api/geoplus/auth/login?next=%2F%3Fid%3Dabc";
  for (const body of [
    null,
    {},
    { login_url: 5 },
    { login_url: "https://evil.test/api/geoplus/auth/login?next=%2F" },
    { login_url: "//evil.test/x" },
    { login_url: "/somewhere/else?next=%2F" },
    { login_url: "/api/geoplus/auth/login/../../evil?next=%2F" },
  ]) {
    assert.equal(resolveSignInTarget(body, here), fallback, JSON.stringify(body));
  }
  // A hostile next inside an otherwise correct login_url is sanitised again.
  assert.equal(
    resolveSignInTarget({ login_url: "/api/geoplus/auth/login?next=https%3A%2F%2Fevil.test%2F" }, here),
    "/api/geoplus/auth/login?next=%2F",
  );
  assert.equal(
    resolveSignInTarget({ login_url: "/api/geoplus/auth/login?next=%2F%2Fevil.test" }, here),
    "/api/geoplus/auth/login?next=%2F",
  );
  assert.equal(
    resolveSignInTarget({ login_url: "/api/geoplus/auth/login?next=%2F%3Fid%3D1&organisation=0193a6ee-1c00-7f4a-a2b9-6d5e4c3b2a19" }, here),
    "/api/geoplus/auth/login?next=%2F%3Fid%3D1&organisation=0193a6ee-1c00-7f4a-a2b9-6d5e4c3b2a19",
  );
});

function memoryGuard(initial: Record<string, string> = {}): RedirectGuard & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

test("handleSignedOut goes to sign in at most once per cooldown", () => {
  const guard = memoryGuard();
  const body = { login_url: "/api/geoplus/auth/login?next=%2F%3Fid%3Dabc" };
  assert.equal(handleSignedOut(body, here, 1_000_000, guard), body.login_url);
  assert.equal(handleSignedOut(body, here, 1_000_000 + 1000, guard), null);
  assert.equal(handleSignedOut(body, here, 1_000_000 + SIGN_IN_REDIRECT_COOLDOWN_MS - 1, guard), null);
  assert.equal(handleSignedOut(body, here, 1_000_000 + SIGN_IN_REDIRECT_COOLDOWN_MS, guard), body.login_url);
});

test("handleSignedOut still redirects when storage is unavailable or holds junk", () => {
  const body = { login_url: "/api/geoplus/auth/login?next=%2F" };
  assert.equal(handleSignedOut(body, here, 5, null), body.login_url);
  const throwing: RedirectGuard = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(handleSignedOut(body, here, 5, throwing), body.login_url);
  assert.equal(handleSignedOut(body, here, 5, memoryGuard({ "geoplus-signin-redirect-at": "junk" })), body.login_url);
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

test("coreFetch on a 401 signed_out answer starts sign-in once, and hands the response back", async () => {
  const assigned: string[] = [];
  const store: Record<string, string> = {};
  const g = globalThis as unknown as Record<string, unknown>;
  const originalWindow = g.window;
  const originalFetch = globalThis.fetch;
  g.window = {
    location: { pathname: "/", search: "?id=abc", assign: (url: string) => void assigned.push(url) },
    sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) },
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "signed_out", login_url: "/api/geoplus/auth/login?next=%2F%3Fid%3Dabc" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  try {
    const first = await coreFetch("/api/v1/projects");
    assert.equal(first.status, 401);
    assert.deepEqual(await first.json(), { error: "signed_out", login_url: "/api/geoplus/auth/login?next=%2F%3Fid%3Dabc" }, "the caller can still read the body");
    await coreFetch("/api/v1/projects");
    assert.deepEqual(assigned, ["/api/geoplus/auth/login?next=%2F%3Fid%3Dabc"]);
  } finally {
    g.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("coreFetch does not redirect on a 503, or on a 401 that is not signed_out", async () => {
  const assigned: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const originalWindow = g.window;
  const originalFetch = globalThis.fetch;
  g.window = { location: { pathname: "/", search: "", assign: (url: string) => void assigned.push(url) }, sessionStorage: memoryGuard() };
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "account_unavailable" }), { status: 503 })) as typeof fetch;
    assert.equal((await coreFetch("/api/v1/projects")).status, 503);
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    assert.equal((await coreFetch("/api/v1/projects")).status, 401);
  } finally {
    g.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(assigned, []);
});
