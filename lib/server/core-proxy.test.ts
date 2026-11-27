import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  createRefreshCoordinator,
  sealSession,
  userIfSignedIn,
  unsealSession,
  type AccountClientConfig,
  type AccountSession,
} from "./account-session.ts";
import {
  coreBackendUrl,
  coreTargetUrl,
  fetchCoreAnonymously,
  fetchCoreWithCurrentSession,
  proxyCoreRequest,
  serializeCookie,
  type CoreProxyOptions,
} from "./core-proxy.ts";

const ISSUER = "http://127.0.0.1:8059";
const NOW = 1_795_514_400;
const ORIGIN = "http://localhost:3001";
const CORE = "http://127.0.0.1:8010";
const KEY = randomBytes(32);

function config(overrides: Partial<AccountClientConfig> = {}): AccountClientConfig {
  return {
    issuer: ISSUER,
    clientId: "geoplus-web-dev",
    clientSecret: "fake-secret-geoplus-web-dev",
    redirectUri: `${ORIGIN}/auth/callback`,
    signedOutUri: `${ORIGIN}/auth/signed-out`,
    keys: [KEY],
    secureCookies: false,
    ...overrides,
  };
}

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    v: 1,
    sub: "0193a6f0-5d1c-7b3e-9c41-2f6a8e0d4b17",
    sid: "0193a6f0-6e2a-7d10-b5c3-90a1f4e7c2d8",
    name: "Amina Rahman",
    email: "amina@example.test",
    org: "0193a6ee-1c00-7f4a-a2b9-6d5e4c3b2a19",
    accessToken: "access-token-1",
    refreshToken: "spr_refresh-1",
    idToken: "id-token-1",
    accessIssuedAt: NOW - 100,
    accessExpiresAt: NOW + 200,
    signedInAt: NOW - 100,
    ...overrides,
  };
}

type Call = { url: string; init: RequestInit & { duplex?: string } };

/** Answers are served in order; a function answer sees the call (for streaming checks). */
function fakeFetch(answers: Array<Response | Error>, calls: Call[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: (init ?? {}) as Call["init"] });
    const next = answers.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function cookieHeader(cfg: AccountClientConfig, value: AccountSession | string, name = "geoplus_session") {
  const sealed = typeof value === "string" ? value : sealSession(cfg, value);
  return `${name}=${encodeURIComponent(sealed)}`;
}

type Setup = { options: CoreProxyOptions; calls: Call[]; cfg: AccountClientConfig };

function setup(answers: Array<Response | Error>, overrides: Partial<CoreProxyOptions> = {}): Setup {
  const cfg = config();
  const calls: Call[] = [];
  const options: CoreProxyOptions = {
    config: cfg,
    deps: { fetch: fakeFetch(answers, calls), now: () => NOW, coordinator: createRefreshCoordinator() },
    coreBaseUrl: CORE,
    allowedOrigins: [ORIGIN],
    ...overrides,
  };
  return { options, calls, cfg };
}

function req(path: string, init: RequestInit & { duplex?: string } = {}) {
  return new Request(`${ORIGIN}${path}`, init as RequestInit);
}

const signedIn = (cfg: AccountClientConfig, s: AccountSession = session()) => ({ cookie: cookieHeader(cfg, s) });
const headerOf = (call: Call, name: string) => new Headers(call.init.headers).get(name);
const setCookies = (response: Response) => response.headers.getSetCookie();

// ---------------------------------------------------------------------------------------------
// Path allow-list
// ---------------------------------------------------------------------------------------------

test("coreTargetUrl: only /api/v1/... on the core origin", () => {
  assert.equal(coreTargetUrl("/api/v1/projects", "?limit=5", CORE)?.toString(), `${CORE}/api/v1/projects?limit=5`);
  assert.equal(coreTargetUrl("/api/v1/geoplus/dashboards/abc", "", CORE)?.pathname, "/api/v1/geoplus/dashboards/abc");
  const refused = [
    "/",
    "/api",
    "/api/v1",
    "/api/v1/",
    "/api/v2/projects",
    "/static/uploads/dashboards/1/x.zip",
    "/healthz",
    "/docs",
    "/api/v1/../static/x",
    "/api/v1/%2e%2e/admin",
    "/api/v1/a/%2E%2e/b",
    "/api/v1/a%2fb",
    "/api/v1/a%5Cb",
    "/api/v1/a\\b",
    "/api/v1//evil.test/x",
    "/api/v1/a%00b",
    "/api/v1/%zz",
    "//evil.test/api/v1/x",
    "http://evil.test/api/v1/x",
  ];
  for (const path of refused) {
    assert.equal(coreTargetUrl(path, "", CORE), null, path);
  }
});

test("coreBackendUrl: server setting first, then the public one, then the development default", () => {
  assert.equal(coreBackendUrl({ CORE_BACKEND_URL: "https://core.example.test/" }), "https://core.example.test");
  assert.equal(coreBackendUrl({ NEXT_PUBLIC_CORE_BACKEND_URL: "http://localhost:9000" }), "http://localhost:9000");
  assert.equal(coreBackendUrl({ CORE_BACKEND_URL: "not a url" }), "http://localhost:8010");
  assert.equal(coreBackendUrl({ NODE_ENV: "production" }), "https://api.spadace.com");
});

test("the proxy answers 404 for paths outside /api/v1 and never calls core", async () => {
  const { options, calls, cfg } = setup([]);
  for (const path of ["/api/core/static/uploads/x.zip", "/api/core/healthz", "/api/core/api/v2/x", "/api/core/", "/api/core/api/v1", "/api/core/api/v1/a%2fb"]) {
    const response = await proxyCoreRequest(req(path, { headers: signedIn(cfg) }), options);
    assert.equal(response.status, 404, path);
  }
  assert.equal(calls.length, 0);
});

test("the proxy refuses paths that are not under its own prefix", async () => {
  const { options, calls, cfg } = setup([]);
  const response = await proxyCoreRequest(req("/api/geoplus/cog?url=x", { headers: signedIn(cfg) }), options);
  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// What goes to core
// ---------------------------------------------------------------------------------------------

test("a signed-in GET goes to core with the bearer, the query string, and no cookie", async () => {
  const { options, calls, cfg } = setup([json(200, [{ uid: "p1" }])]);
  const response = await proxyCoreRequest(
    req("/api/core/api/v1/projects?limit=200&offset=0", {
      headers: {
        ...signedIn(cfg),
        accept: "application/json",
        "accept-language": "en",
        authorization: "Bearer browser-supplied",
        "x-forwarded-for": "203.0.113.9",
        "x-csrf-token": "x",
        origin: ORIGIN,
        referer: `${ORIGIN}/?id=abc`,
        "x-spadace-organisation": "other",
      },
    }),
    options,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ uid: "p1" }]);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.url, `${CORE}/api/v1/projects?limit=200&offset=0`);
  assert.equal(call.init.method, "GET");
  assert.equal(headerOf(call, "authorization"), "Bearer access-token-1");
  assert.equal(headerOf(call, "cookie"), null, "no cookie is forwarded to core");
  assert.equal(headerOf(call, "origin"), null);
  assert.equal(headerOf(call, "referer"), null);
  assert.equal(headerOf(call, "x-forwarded-for"), null);
  assert.equal(headerOf(call, "x-csrf-token"), null);
  assert.equal(headerOf(call, "x-spadace-organisation"), null);
  assert.equal(headerOf(call, "accept"), "application/json");
  assert.equal(headerOf(call, "accept-language"), "en");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.cache, "no-store");
  assert.equal(setCookies(response).length, 0, "a fresh session leaves the cookie alone");
});

test("the session cookie value never appears in what core receives", async () => {
  const { options, calls, cfg } = setup([json(200, {})]);
  const sealed = sealSession(cfg, session());
  await proxyCoreRequest(req("/api/core/api/v1/users/me", { headers: { cookie: `geoplus_session=${encodeURIComponent(sealed)}; other=1` } }), options);
  const sent = JSON.stringify([...new Headers(calls[0].init.headers).entries()]);
  assert.equal(sent.includes(sealed), false);
  assert.equal(sent.includes(encodeURIComponent(sealed)), false);
  assert.equal(sent.includes("refresh"), false);
});

test("a body is streamed to core, not read into memory", async () => {
  const { options, calls, cfg } = setup([json(201, { dataset: { source_uri: "x" } })]);
  const form = new FormData();
  form.append("file", new Blob(["hello"]), "a.zip");
  form.append("dashboard_id", "abc");
  const request = req("/api/core/api/v1/geoplus/uploads/datasets", {
    method: "POST",
    headers: { ...signedIn(cfg), origin: ORIGIN },
    body: form,
  });
  const response = await proxyCoreRequest(request, options);
  assert.equal(response.status, 201);
  const [call] = calls;
  assert.equal(call.init.method, "POST");
  assert.ok(call.init.body instanceof ReadableStream, "the request body stream is handed on");
  assert.equal(call.init.duplex, "half");
  assert.match(headerOf(call, "content-type") ?? "", /^multipart\/form-data; boundary=/);
});

test("a GET carries no body and no duplex setting", async () => {
  const { options, calls, cfg } = setup([json(200, {})]);
  await proxyCoreRequest(req("/api/core/api/v1/layers", { headers: signedIn(cfg) }), options);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.duplex, undefined);
});

test("the answer streams back with only safe headers", async () => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new TextEncoder().encode(`chunk${pulled};`));
      if (pulled === 3) controller.close();
    },
  });
  const upstream = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/geo+json",
      "Content-Encoding": "gzip",
      "Content-Length": "999",
      "Set-Cookie": "access_token=leak; Path=/",
      "Cache-Control": "public, max-age=3600",
      ETag: '"abc"',
      "Content-Disposition": 'attachment; filename="a.geojson"',
      "Retry-After": "5",
      Location: "http://evil.test/",
      "Access-Control-Allow-Origin": "*",
      "WWW-Authenticate": "Bearer",
      "X-Powered-By": "core",
    },
  });
  const { options, cfg } = setup([upstream]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/layers/x/export", { headers: signedIn(cfg) }), options);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/geo+json");
  assert.equal(response.headers.get("etag"), '"abc"');
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="a.geojson"');
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  for (const name of ["set-cookie", "content-encoding", "content-length", "location", "access-control-allow-origin", "www-authenticate", "x-powered-by"]) {
    assert.equal(response.headers.get(name), null, name);
  }
  assert.equal(pulled <= 1, true, "the body is not drained before the caller reads it");
  assert.equal(await response.text(), "chunk1;chunk2;chunk3;");
});

test("core error answers pass through with their status and body", async () => {
  const { options, cfg } = setup([json(409, { code: "LayerNameInUse" }), json(404, { code: "NotFound" }), json(429, { code: "RateLimited" }, { "Retry-After": "7" })]);
  const first = await proxyCoreRequest(req("/api/core/api/v1/layers", { headers: signedIn(cfg) }), options);
  assert.equal(first.status, 409);
  assert.deepEqual(await first.json(), { code: "LayerNameInUse" });
  assert.equal((await proxyCoreRequest(req("/api/core/api/v1/layers/x", { headers: signedIn(cfg) }), options)).status, 404);
  const limited = await proxyCoreRequest(req("/api/core/api/v1/layers/y", { headers: signedIn(cfg) }), options);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "7");
});

test("a redirect from core is not followed and becomes 502", async () => {
  const { options, calls, cfg } = setup([new TypeError("fetch failed: redirect mode is set to error")]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/layers", { headers: signedIn(cfg) }), options);
  assert.equal(response.status, 502);
  assert.equal(calls[0].init.redirect, "error");
  assert.deepEqual(await response.json(), { error: "core_unavailable" });
});

test("methods: GET, HEAD, POST, PUT, PATCH, DELETE only", async () => {
  const { options, cfg } = setup([json(200, {})]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/layers", { method: "OPTIONS", headers: signedIn(cfg) }), options);
  assert.equal(response.status, 405);
  assert.match(response.headers.get("allow") ?? "", /GET/);
});

// ---------------------------------------------------------------------------------------------
// Same origin
// ---------------------------------------------------------------------------------------------

test("state-changing requests from another origin are refused before anything else", async () => {
  const { options, calls, cfg } = setup([]);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await proxyCoreRequest(
      req("/api/core/api/v1/geoplus/dashboards", {
        method,
        headers: { ...signedIn(cfg), origin: "https://evil.test", "content-type": "application/json" },
        body: "{}",
      }),
      options,
    );
    assert.equal(response.status, 403, method);
  }
  // No Origin: Sec-Fetch-Site decides.
  const crossSite = await proxyCoreRequest(
    req("/api/core/api/v1/geoplus/dashboards", { method: "POST", headers: { ...signedIn(cfg), "sec-fetch-site": "cross-site" }, body: "{}" }),
    options,
  );
  assert.equal(crossSite.status, 403);
  const neither = await proxyCoreRequest(req("/api/core/api/v1/geoplus/dashboards", { method: "POST", headers: signedIn(cfg), body: "{}" }), options);
  assert.equal(neither.status, 403, "no Origin and no Sec-Fetch-Site is refused");
  assert.equal(calls.length, 0);
});

test("same-origin POST is accepted, including the registered return address origin", async () => {
  const { options, calls, cfg } = setup([json(200, {}), json(200, {})], { allowedOrigins: [ORIGIN, "https://geoplus.example.test"] });
  const a = await proxyCoreRequest(
    req("/api/core/api/v1/geoplus/dashboards", { method: "POST", headers: { ...signedIn(cfg), origin: ORIGIN }, body: "{}" }),
    options,
  );
  assert.equal(a.status, 200);
  const b = await proxyCoreRequest(
    req("/api/core/api/v1/geoplus/dashboards", { method: "POST", headers: { ...signedIn(cfg), "sec-fetch-site": "same-origin" }, body: "{}" }),
    options,
  );
  assert.equal(b.status, 200);
  assert.equal(calls.length, 2);
});

test("a cross-site GET is refused too (Sec-Fetch-Site), a same-site one without the header is fine", async () => {
  const { options, calls, cfg } = setup([json(200, {})]);
  const refused = await proxyCoreRequest(req("/api/core/api/v1/layers", { headers: { ...signedIn(cfg), "sec-fetch-site": "cross-site" } }), options);
  assert.equal(refused.status, 403);
  assert.equal(calls.length, 0);
  const ok = await proxyCoreRequest(req("/api/core/api/v1/layers", { headers: signedIn(cfg) }), options);
  assert.equal(ok.status, 200);
});

// ---------------------------------------------------------------------------------------------
// Sign-in state
// ---------------------------------------------------------------------------------------------

test("no cookie: 401 with the sign-in address for the page that asked (referer, sanitised)", async () => {
  const { options, calls } = setup([]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: { referer: `${ORIGIN}/?id=abc&project_uid=p1` } }), options);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as { error: string; login_url: string };
  assert.equal(body.error, "signed_out");
  assert.equal(body.login_url, `/api/geoplus/auth/login?${new URLSearchParams({ next: "/?id=abc&project_uid=p1" })}`);
  assert.equal(calls.length, 0);
  assert.equal(setCookies(response).length, 0, "nothing to clear");
});

test("the sign-in address never takes next from another origin or from an api path", async () => {
  const { options } = setup([]);
  for (const referer of ["https://evil.test/steal", "//evil.test/x", `${ORIGIN}/api/core/api/v1/x`, `${ORIGIN}/auth/callback?code=1`, "not a url", ""]) {
    const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: referer ? { referer } : {} }), options);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { login_url: string };
    assert.equal(body.login_url, "/api/geoplus/auth/login?next=%2F", referer);
  }
});

test("a session that cannot be opened (or is too old): 401, cookie cleared, core not called", async () => {
  const { options, calls, cfg } = setup([]);
  const junk = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: { cookie: cookieHeader(cfg, "garbage") } }), options);
  assert.equal(junk.status, 401);
  const cleared = setCookies(junk);
  assert.equal(cleared.length, 1);
  assert.match(cleared[0], /^geoplus_session=;/);
  assert.match(cleared[0], /Max-Age=0/);
  assert.match(cleared[0], /HttpOnly/);
  const old = await proxyCoreRequest(
    req("/api/core/api/v1/projects", { headers: signedIn(cfg, session({ signedInAt: NOW - 31 * 24 * 3600 })) }),
    options,
  );
  assert.equal(old.status, 401);
  assert.match(setCookies(old)[0], /Max-Age=0/);
  assert.equal(calls.length, 0);
});

test("a due renewal rotates the refresh token: new cookie written, new access token sent", async () => {
  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const { options, calls, cfg } = setup([
    json(200, { token_type: "Bearer", access_token: "access-token-2", expires_in: 300, refresh_token: "spr_refresh-2", organisation_id: due.org }),
    json(200, { ok: true }),
  ]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${ISSUER}/oauth/token`);
  assert.equal(headerOf(calls[1], "authorization"), "Bearer access-token-2");
  const cookies = setCookies(response);
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /^geoplus_session=/);
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /SameSite=Lax/);
  assert.match(cookies[0], /Path=\//);
  assert.doesNotMatch(cookies[0], /Domain=/);
  assert.doesNotMatch(cookies[0], /Secure/, "development: not Secure");
  const value = decodeURIComponent(cookies[0].split(";")[0].slice("geoplus_session=".length));
  const written = unsealSession(cfg, value);
  assert.equal(written?.refreshToken, "spr_refresh-2");
  assert.equal(written?.accessToken, "access-token-2");
  // Max-Age runs to the end of the 30-day sign-in, not a fresh 30 days.
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookies[0])?.[1]);
  assert.equal(maxAge, due.signedInAt + 30 * 24 * 3600 - NOW);
});

test("production cookie is __Host- prefixed and Secure, read and written under that name", async () => {
  const cfg = config({ secureCookies: true });
  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const { options } = setup(
    [json(200, { token_type: "Bearer", access_token: "access-token-2", expires_in: 300, refresh_token: "spr_refresh-2" }), json(200, {})],
    { config: cfg },
  );
  const response = await proxyCoreRequest(
    req("/api/core/api/v1/projects", { headers: { cookie: cookieHeader(cfg, due, "__Host-geoplus_session") } }),
    options,
  );
  assert.equal(response.status, 200);
  const [cookie] = setCookies(response);
  assert.match(cookie, /^__Host-geoplus_session=/);
  assert.match(cookie, /Secure/);
});

test("Account refuses the renewal for good: 401, cookie cleared, core not called", async () => {
  const due = session({ refreshToken: "spr_dead", accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const { options, calls, cfg } = setup([json(400, { error: "invalid_grant", code: "refresh_token_invalid" })]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: { ...signedIn(cfg, due), referer: `${ORIGIN}/?id=z` } }), options);
  assert.equal(response.status, 401);
  assert.match(setCookies(response)[0], /^geoplus_session=;.*Max-Age=0/);
  assert.equal(calls.length, 1, "only the token call");
  const body = (await response.json()) as { login_url: string };
  assert.equal(body.login_url, `/api/geoplus/auth/login?${new URLSearchParams({ next: "/?id=z" })}`);
});

test("Account unreachable and the access token expired: 503, the session is kept (no cookie change), core not called", async () => {
  const due = session({ accessIssuedAt: NOW - 400, accessExpiresAt: NOW - 10 });
  const { options, calls, cfg } = setup([new Error("down")]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "account_unavailable" });
  assert.equal(setCookies(response).length, 0);
  assert.equal(calls.length, 1);
});

test("a refusal that does not spend the refresh token is 503 (token expired) and keeps the session", async () => {
  for (const code of ["organisation_access_ended", "product_not_linked"]) {
    const due = session({ accessIssuedAt: NOW - 400, accessExpiresAt: NOW - 10 });
    const { options, cfg } = setup([json(400, { error: "invalid_target", code })]);
    const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
    assert.equal(response.status, 503, code);
    assert.equal(setCookies(response).length, 0, code);
  }
});

test("Account rotates then fails, token expired: 503, and the rotated refresh token is saved in the cookie", async () => {
  const due = session({ accessIssuedAt: NOW - 400, accessExpiresAt: NOW - 10 });
  // A new refresh token arrives, but no usable access token: the new refresh token must not be lost.
  const { options, cfg } = setup([json(200, { token_type: "Bearer", refresh_token: "spr_refresh-2" })]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
  assert.equal(response.status, 503);
  const [cookie] = setCookies(response);
  assert.ok(cookie, "the rotated session is written");
  const value = decodeURIComponent(cookie.split(";")[0].slice("geoplus_session=".length));
  assert.equal(unsealSession(cfg, value)?.refreshToken, "spr_refresh-2");
});

test("core says 401 with a fresh token: 401 with the sign-in address, cookie left for the new sign-in to replace", async () => {
  const { options, cfg } = setup([json(401, { code: "Unauthorized" }, { "WWW-Authenticate": "Bearer" })]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: { ...signedIn(cfg), referer: `${ORIGIN}/` } }), options);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), null);
  const body = (await response.json()) as { error: string; login_url: string };
  assert.equal(body.error, "signed_out");
  assert.equal(body.login_url, "/api/geoplus/auth/login?next=%2F");
});

test("renewed session plus a core 401 still writes the rotated cookie", async () => {
  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const { options, cfg } = setup([
    json(200, { token_type: "Bearer", access_token: "access-token-2", expires_in: 300, refresh_token: "spr_refresh-2" }),
    json(401, {}),
  ]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
  assert.equal(response.status, 401);
  assert.equal(setCookies(response).length, 1);
});

test("no Account settings: 503 not_configured", async () => {
  const { options, calls } = setup([], { config: null });
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects"), options);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "not_configured" });
  assert.equal(calls.length, 0);
});

test("tokens are never written to the console", async () => {
  const seen: string[] = [];
  const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ["log", "error", "warn", "info"] as const) console[name] = (...args: unknown[]) => void seen.push(args.map(String).join(" "));
  try {
    const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
    const { options, cfg } = setup([new Error("boom access-token-1 spr_refresh-1"), new Error("boom access-token-1")]);
    await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
    const ok = setup([new TypeError("fetch failed access-token-1")]);
    await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(ok.cfg) }), ok.options);
  } finally {
    Object.assign(console, originals);
  }
  for (const line of seen) {
    assert.doesNotMatch(line, /access-token|spr_refresh|id-token/);
  }
});

// ---------------------------------------------------------------------------------------------
// Cookie text, and the server-side read for pages
// ---------------------------------------------------------------------------------------------

test("serializeCookie writes the attributes the session needs", () => {
  const cfg = config({ secureCookies: true });
  const text = serializeCookie({ name: "__Host-geoplus_session", value: "v1.abc:def", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 120 } });
  assert.equal(text, "__Host-geoplus_session=v1.abc%3Adef; Path=/; Max-Age=120; HttpOnly; Secure; SameSite=Lax");
  assert.equal(cfg.secureCookies, true);
});

test("fetchCoreWithCurrentSession: uses the access token as it is, never renews, null when it cannot", async () => {
  const cfg = config();
  const calls: Call[] = [];
  const deps = { fetch: fakeFetch([json(200, { name: "P" })], calls), now: () => NOW, coreBaseUrl: CORE };
  const ok = await fetchCoreWithCurrentSession(cfg, sealSession(cfg, session()), "/api/v1/projects/p1", {}, deps);
  assert.equal(ok?.status, 200);
  assert.equal(calls[0].url, `${CORE}/api/v1/projects/p1`);
  assert.equal(headerOf(calls[0], "authorization"), "Bearer access-token-1");
  assert.equal(headerOf(calls[0], "cookie"), null);
  assert.equal(calls[0].init.redirect, "error");

  // Due for renewal but not yet expired: still used as it is (a page cannot write the rotated cookie).
  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const stillUsable = await fetchCoreWithCurrentSession(cfg, sealSession(cfg, due), "/api/v1/projects/p1", {}, { ...deps, fetch: fakeFetch([json(200, {})], calls) });
  assert.equal(stillUsable?.status, 200);
  assert.equal(calls.some((call) => call.url.includes("/oauth/token")), false);

  const expired = session({ accessIssuedAt: NOW - 400, accessExpiresAt: NOW - 100 });
  const none = fakeFetch([]);
  assert.equal(await fetchCoreWithCurrentSession(cfg, sealSession(cfg, expired), "/api/v1/projects/p1", {}, { ...deps, fetch: none }), null);
  assert.equal(await fetchCoreWithCurrentSession(cfg, undefined, "/api/v1/projects/p1", {}, { ...deps, fetch: none }), null);
  assert.equal(await fetchCoreWithCurrentSession(cfg, "garbage", "/api/v1/projects/p1", {}, { ...deps, fetch: none }), null);
  assert.equal(await fetchCoreWithCurrentSession(cfg, sealSession(cfg, session()), "/static/x", {}, { ...deps, fetch: none }), null);
  const down = await fetchCoreWithCurrentSession(cfg, sealSession(cfg, session()), "/api/v1/x", {}, { ...deps, fetch: fakeFetch([new Error("down")]) });
  assert.equal(down, null);
});

// ---------------------------------------------------------------------------------------------
// Review fixes: renewal trouble with a still-valid token, header timeout, public pages, 30-day limit
// ---------------------------------------------------------------------------------------------

test("renewal unavailable but the access token is still valid: the call proceeds with it", async () => {
  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  for (const failure of [new Error("down"), json(400, { error: "invalid_target", code: "product_not_linked" })]) {
    const { options, calls, cfg } = setup([failure, json(200, { ok: true })]);
    const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(headerOf(calls[1], "authorization"), "Bearer access-token-1");
    assert.equal(setCookies(response).length, 0, "nothing was rotated");
  }
});

test("renewal rotated the refresh token then failed, access token still valid: proceeds and saves the rotated cookie", async () => {
  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const { options, calls, cfg } = setup([json(200, { token_type: "Bearer", refresh_token: "spr_refresh-2" }), json(200, {})]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
  assert.equal(response.status, 200);
  assert.equal(headerOf(calls[1], "authorization"), "Bearer access-token-1");
  const [cookie] = setCookies(response);
  const value = decodeURIComponent(cookie.split(";")[0].slice("geoplus_session=".length));
  assert.equal(unsealSession(cfg, value)?.refreshToken, "spr_refresh-2");
});

test("renewal unavailable and the access token expired exactly now: 503", async () => {
  const due = session({ accessIssuedAt: NOW - 300, accessExpiresAt: NOW });
  const { options, calls, cfg } = setup([new Error("down")]);
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg, due) }), options);
  assert.equal(response.status, 503);
  assert.equal(calls.length, 1);
});

test("core does not answer headers in time: 504, the wait is bounded and the request is aborted", async () => {
  const { cfg } = setup([]);
  let aborted = false;
  const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    })) as typeof fetch;
  const options: CoreProxyOptions = {
    config: cfg,
    deps: { fetch: hanging, now: () => NOW, coordinator: createRefreshCoordinator() },
    coreBaseUrl: CORE,
    allowedOrigins: [ORIGIN],
    headerTimeoutMs: 20,
  };
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg) }), options);
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: "core_timeout" });
  assert.equal(aborted, true);
});

test("the timeout is cleared once headers arrive: a slow body is not cut", async () => {
  const { cfg } = setup([]);
  let signal: AbortSignal | undefined;
  const slow = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode("a"));
        await new Promise((resolve) => setTimeout(resolve, 80));
        controller.enqueue(new TextEncoder().encode("b"));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const options: CoreProxyOptions = {
    config: cfg,
    deps: { fetch: slow, now: () => NOW, coordinator: createRefreshCoordinator() },
    coreBaseUrl: CORE,
    allowedOrigins: [ORIGIN],
    headerTimeoutMs: 20,
  };
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg) }), options);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ab");
  assert.equal(signal?.aborted, false);
});

test("the client going away is not a timeout (502, not 504)", async () => {
  const { cfg } = setup([]);
  const controller = new AbortController();
  const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      setTimeout(() => controller.abort(), 5);
    })) as typeof fetch;
  const options: CoreProxyOptions = {
    config: cfg,
    deps: { fetch: hanging, now: () => NOW, coordinator: createRefreshCoordinator() },
    coreBaseUrl: CORE,
    allowedOrigins: [ORIGIN],
    headerTimeoutMs: 5_000,
  };
  const response = await proxyCoreRequest(req("/api/core/api/v1/projects", { headers: signedIn(cfg), signal: controller.signal }), options);
  assert.equal(response.status, 502);
});

test("fetchCoreAnonymously sends no Authorization and no cookie, only /api/v1 paths", async () => {
  const calls: Call[] = [];
  const deps = { fetch: fakeFetch([json(200, { layers: [] })], calls), coreBaseUrl: CORE };
  const ok = await fetchCoreAnonymously("/api/v1/geoplus/dashboards/abc/public", deps);
  assert.equal(ok?.status, 200);
  assert.equal(calls[0].url, `${CORE}/api/v1/geoplus/dashboards/abc/public`);
  assert.equal(headerOf(calls[0], "authorization"), null);
  assert.equal(headerOf(calls[0], "cookie"), null);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(await fetchCoreAnonymously("/static/x", { ...deps, fetch: fakeFetch([]) }), null);
  assert.equal(await fetchCoreAnonymously("/api/v1/x", { ...deps, fetch: fakeFetch([new Error("down")]) }), null);
});

test("userIfSignedIn: the user from a sealed session, until the 30-day sign-in ends", () => {
  const cfg = config();
  const ok = userIfSignedIn(cfg, sealSession(cfg, session()), NOW);
  assert.equal(ok?.email, "amina@example.test");
  assert.equal(ok?.name, "Amina Rahman");
  assert.equal(userIfSignedIn(cfg, sealSession(cfg, session({ signedInAt: NOW - 30 * 24 * 3600 })), NOW), null, "exactly 30 days is over");
  assert.ok(userIfSignedIn(cfg, sealSession(cfg, session({ signedInAt: NOW - 30 * 24 * 3600 + 1 })), NOW));
  assert.equal(userIfSignedIn(cfg, "garbage", NOW), null);
  assert.equal(userIfSignedIn(cfg, undefined, NOW), null);
});
