import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, randomBytes, sign as signData, type KeyObject } from "node:crypto";
import test from "node:test";

import {
  AccountConfigError,
  AccountUnavailableError,
  SignInError,
  beginSignIn,
  checkIdToken,
  createKeySetCache,
  createRefreshCoordinator,
  endSessionUrl,
  ensureFreshSession,
  finishSignIn,
  isSameOriginRequest,
  loginCookie,
  pkceChallenge,
  readAccountConfig,
  refreshSession,
  seal,
  sealSession,
  sessionCookie,
  sessionUser,
  unseal,
  unsealPending,
  unsealSession,
  type AccountClientConfig,
  type AccountSession,
  type KeySetCache,
  type PendingSignIn,
} from "./account-session.ts";

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const ISSUER = "http://127.0.0.1:8059";
const CLIENT_ID = "geoplus-web-dev";
const NOW = 1_795_514_400;
const USER = "0193a6f0-5d1c-7b3e-9c41-2f6a8e0d4b17";
const ORG = "0193a6ee-1c00-7f4a-a2b9-6d5e4c3b2a19";
const SID = "0193a6f0-6e2a-7d10-b5c3-90a1f4e7c2d8";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);

function config(overrides: Partial<AccountClientConfig> = {}): AccountClientConfig {
  return {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: "fake-secret-geoplus-web-dev",
    redirectUri: "http://localhost:3001/auth/callback",
    signedOutUri: "http://localhost:3001/auth/signed-out",
    keys: [KEY_A],
    secureCookies: false,
    ...overrides,
  };
}

const b64u = (raw: Buffer | string) => Buffer.from(raw).toString("base64url");

const signer = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "kid-current";

function publicJwk(key: KeyObject, kid: string) {
  const jwk = key.export({ format: "jwk" }) as Record<string, unknown>;
  return { ...jwk, kid, alg: "ES256", use: "sig" };
}

function staticKeys(entries: Record<string, KeyObject>): KeySetCache {
  return { getKey: async (kid: string) => entries[kid] ?? null };
}

function es256(header: Record<string, unknown>, claims: Record<string, unknown>, privateKey: KeyObject = signer.privateKey): string {
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const signature = signData("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u(signature)}`;
}

function idClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISSUER,
    sub: USER,
    aud: CLIENT_ID,
    iat: NOW,
    exp: NOW + 300,
    auth_time: NOW - 5,
    nonce: "nonce-1",
    sid: SID,
    amr: ["pwd"],
    token_use: "id",
    email: "amina@example.test",
    email_verified: true,
    name: "Amina Rahman",
    ...overrides,
  };
}

const HEADER = { alg: "ES256", typ: "JWT", kid: KID };
const keys = staticKeys({ [KID]: signer.publicKey });

function pending(overrides: Partial<PendingSignIn> = {}): PendingSignIn {
  return { state: "state-1", nonce: "nonce-1", verifier: "v".repeat(86), createdAt: NOW - 10, next: "/?id=abc", ...overrides };
}

type Call = { url: string; init: RequestInit };

function fakeFetch(answers: Array<Response | Error>, calls: Call[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = answers.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function tokenAnswer(overrides: Record<string, unknown> = {}) {
  return {
    token_type: "Bearer",
    access_token: "access-token-1",
    expires_in: 300,
    refresh_token: "spr_refresh-1",
    id_token: es256(HEADER, idClaims()),
    scope: "openid profile email",
    audience: "geoplus",
    organisation_id: ORG,
    ...overrides,
  };
}

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    v: 1,
    sub: USER,
    sid: SID,
    name: "Amina Rahman",
    email: "amina@example.test",
    org: ORG,
    accessToken: "access-token-1",
    refreshToken: "spr_refresh-1",
    idToken: "id-token-1",
    accessIssuedAt: NOW - 100,
    accessExpiresAt: NOW + 200,
    signedInAt: NOW - 100,
    ...overrides,
  };
}

const formOf = (call: Call) => new URLSearchParams(String(call.init.body));
const headerOf = (call: Call, name: string) => new Headers(call.init.headers).get(name);

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

test("readAccountConfig: development defaults point at GeoPlus 3001 and Account 8050", () => {
  const cfg = readAccountConfig({
    ACCOUNT_WEB_CLIENT_SECRET: "s",
    GEOPLUS_SESSION_KEY: b64u(KEY_A),
  });
  assert.equal(cfg.issuer, "http://localhost:8050");
  assert.equal(cfg.clientId, "geoplus-web-dev");
  assert.equal(cfg.redirectUri, "http://localhost:3001/auth/callback");
  assert.equal(cfg.signedOutUri, "http://localhost:3001/auth/signed-out");
  assert.equal(cfg.secureCookies, false);
  assert.equal(cfg.keys.length, 1);
});

test("readAccountConfig: previous keys are kept for unsealing, the current key seals", () => {
  const cfg = readAccountConfig({
    ACCOUNT_WEB_CLIENT_SECRET: "s",
    GEOPLUS_SESSION_KEY: b64u(KEY_B),
    GEOPLUS_SESSION_PREVIOUS_KEYS: ` ${b64u(KEY_A)} `,
  });
  assert.equal(cfg.keys.length, 2);
  assert.ok(cfg.keys[0].equals(KEY_B));
});

test("readAccountConfig: refuses a missing secret, a short key and development settings in production", () => {
  assert.throws(() => readAccountConfig({ GEOPLUS_SESSION_KEY: b64u(KEY_A) }), AccountConfigError);
  assert.throws(() => readAccountConfig({ ACCOUNT_WEB_CLIENT_SECRET: "s" }), AccountConfigError);
  assert.throws(
    () => readAccountConfig({ ACCOUNT_WEB_CLIENT_SECRET: "s", GEOPLUS_SESSION_KEY: b64u(randomBytes(16)) }),
    AccountConfigError,
  );
  const prod = {
    NODE_ENV: "production",
    ACCOUNT_ISSUER: "https://account.spadace.com",
    ACCOUNT_WEB_CLIENT_ID: "geoplus-web",
    ACCOUNT_WEB_CLIENT_SECRET: "s",
    ACCOUNT_WEB_REDIRECT_URI: "https://geoplus.spadace.com/auth/callback",
    ACCOUNT_WEB_SIGNED_OUT_URI: "https://geoplus.spadace.com/auth/signed-out",
    GEOPLUS_SESSION_KEY: b64u(KEY_A),
  };
  assert.equal(readAccountConfig(prod).secureCookies, true);
  assert.throws(() => readAccountConfig({ ...prod, ACCOUNT_WEB_CLIENT_ID: "geoplus-web-dev" }), AccountConfigError);
  assert.throws(
    () => readAccountConfig({ ...prod, ACCOUNT_WEB_REDIRECT_URI: "http://localhost:3001/auth/callback" }),
    AccountConfigError,
  );
  const { ACCOUNT_ISSUER: _issuer, ...noIssuer } = prod;
  void _issuer;
  assert.throws(() => readAccountConfig(noIssuer), AccountConfigError);
});

test("readAccountConfig: the error message never contains the secret or the key", () => {
  try {
    readAccountConfig({ ACCOUNT_WEB_CLIENT_SECRET: "very-secret-value", GEOPLUS_SESSION_KEY: "short-key-value" });
    assert.fail("expected an error");
  } catch (error) {
    assert.ok(error instanceof AccountConfigError);
    assert.ok(!error.message.includes("very-secret-value"));
    assert.ok(!error.message.includes("short-key-value"));
  }
});

// ---------------------------------------------------------------------------------------------
// PKCE and the authorise address
// ---------------------------------------------------------------------------------------------

test("pkceChallenge: RFC 7636 appendix B", () => {
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("beginSignIn: authorise address with code, S256, state, nonce and the registered return address", () => {
  const { url, pending: kept } = beginSignIn(config(), { next: "/?id=abc", organisation: ORG }, NOW);
  const parsed = new URL(url);
  assert.equal(`${parsed.origin}${parsed.pathname}`, `${ISSUER}/oauth/authorize`);
  const q = parsed.searchParams;
  assert.equal(q.get("response_type"), "code");
  assert.equal(q.get("client_id"), CLIENT_ID);
  assert.equal(q.get("redirect_uri"), "http://localhost:3001/auth/callback");
  assert.equal(q.get("scope"), "openid profile email");
  assert.equal(q.get("code_challenge_method"), "S256");
  assert.equal(q.get("code_challenge"), pkceChallenge(kept.verifier));
  assert.equal(q.get("state"), kept.state);
  assert.equal(q.get("nonce"), kept.nonce);
  assert.equal(q.get("organisation"), ORG);
  assert.equal(q.get("code_verifier"), null);
  assert.ok(kept.verifier.length >= 43 && kept.verifier.length <= 128);
  assert.ok(kept.state.length >= 32 && kept.nonce.length >= 32);
  assert.equal(kept.createdAt, NOW);
  assert.equal(kept.next, "/?id=abc");
});

test("beginSignIn: unsafe next becomes / and a non-UUID organisation is dropped", () => {
  const a = beginSignIn(config(), { next: "https://evil.example/", organisation: "not-a-uuid" }, NOW);
  assert.equal(a.pending.next, "/");
  assert.equal(new URL(a.url).searchParams.get("organisation"), null);
  const b = beginSignIn(config(), { next: "/auth/callback?code=x" }, NOW);
  assert.equal(b.pending.next, "/");
  const c = beginSignIn(config(), {}, NOW);
  assert.notEqual(c.pending.state, b.pending.state);
});

// ---------------------------------------------------------------------------------------------
// Sealing (P3-D15)
// ---------------------------------------------------------------------------------------------

test("seal/unseal: round trip, bound to its purpose, tamper refused", () => {
  const sealed = seal({ hello: "world" }, "session", [KEY_A]);
  assert.ok(!sealed.includes("world"));
  assert.deepEqual(unseal(sealed, "session", [KEY_A]), { hello: "world" });
  assert.equal(unseal(sealed, "login", [KEY_A]), null);
  assert.equal(unseal(sealed, "session", [KEY_B]), null);
  const parts = sealed.split(".");
  const body = Buffer.from(parts[2], "base64url");
  body[0] ^= 1;
  assert.equal(unseal([parts[0], parts[1], b64u(body)].join("."), "session", [KEY_A]), null);
  for (const junk of ["", "v1", "v1..", "v2.a.b", "not sealed at all", undefined, null]) {
    assert.equal(unseal(junk, "session", [KEY_A]), null);
  }
});

test("seal/unseal: a value sealed with a previous key still opens; new values use the current key", () => {
  const old = seal({ n: 1 }, "session", [KEY_A]);
  assert.deepEqual(unseal(old, "session", [KEY_B, KEY_A]), { n: 1 });
  const fresh = seal({ n: 2 }, "session", [KEY_B, KEY_A]);
  assert.equal(unseal(fresh, "session", [KEY_A]), null);
  assert.equal(seal({ n: 1 }, "session", [KEY_A]) === seal({ n: 1 }, "session", [KEY_A]), false);
});

test("unsealSession / unsealPending refuse values of the wrong shape", () => {
  const cfg = config();
  assert.equal(unsealSession(cfg, seal({ v: 1 }, "session", cfg.keys)), null);
  assert.equal(unsealPending(cfg, seal({ state: "s" }, "login", cfg.keys)), null);
  const good = sealSession(cfg, session());
  assert.deepEqual(unsealSession(cfg, good), session());
  // A sealed login value never passes as a session and the other way round.
  const login = seal(pending(), "login", cfg.keys);
  assert.equal(unsealSession(cfg, login), null);
  assert.equal(unsealPending(cfg, good), null);
  assert.deepEqual(unsealPending(cfg, login), pending());
});

test("sealSession: realistic tokens fit in one cookie", () => {
  const big = "x".repeat(900);
  const sealed = sealSession(config(), session({ accessToken: big, idToken: big, refreshToken: `spr_${"y".repeat(43)}` }));
  assert.ok(sealed.length < 3800, `sealed length ${sealed.length}`);
  assert.throws(() => sealSession(config(), session({ accessToken: "z".repeat(4000) })), /too large/);
});

test("cookies: HttpOnly, SameSite=Lax, path /, no Domain; Secure and __Host- outside dev", () => {
  const dev = sessionCookie(config(), "value", NOW, NOW - 10);
  assert.equal(dev.name, "geoplus_session");
  assert.deepEqual(
    { ...dev.options },
    { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 30 * 24 * 3600 - 10 },
  );
  assert.equal("domain" in dev.options, false);
  const prod = sessionCookie(config({ secureCookies: true }), "value", NOW, NOW);
  assert.equal(prod.name, "__Host-geoplus_session");
  assert.equal(prod.options.secure, true);
  const cleared = sessionCookie(config(), null, NOW, NOW);
  assert.equal(cleared.value, "");
  assert.equal(cleared.options.maxAge, 0);
  const login = loginCookie(config(), "v");
  assert.equal(login.name, "geoplus_login");
  assert.equal(login.options.maxAge, 600);
  assert.equal(login.options.httpOnly, true);
  assert.equal(loginCookie(config({ secureCookies: true }), null).name, "__Host-geoplus_login");
});

// ---------------------------------------------------------------------------------------------
// ID token (identity.md 5.1 step 5, 7.2)
// ---------------------------------------------------------------------------------------------

const check = (token: string, opts: Partial<Parameters<typeof checkIdToken>[1]> = {}) =>
  checkIdToken(token, { issuer: ISSUER, clientId: CLIENT_ID, nonce: "nonce-1", now: NOW, keys, ...opts });

async function refused(promise: Promise<unknown>, code = "id_token_invalid") {
  await assert.rejects(promise, (error: unknown) => error instanceof SignInError && error.code === code);
}

test("checkIdToken: a correct ES256 ID token passes", async () => {
  const claims = await check(es256(HEADER, idClaims()));
  assert.equal(claims.sub, USER);
  assert.equal(claims.sid, SID);
});

test("id_f: nonce mismatch is refused", async () => {
  await refused(check(es256(HEADER, idClaims({ nonce: "nonce-from-another-sign-in" }))));
  await refused(check(es256(HEADER, idClaims({ nonce: undefined }))));
});

test("id_f: wrong aud is refused (another client, a list, a product key)", async () => {
  await refused(check(es256(HEADER, idClaims({ aud: "geolabel-web-dev" }))));
  await refused(check(es256(HEADER, idClaims({ aud: [CLIENT_ID] }))));
  await refused(check(es256(HEADER, idClaims({ aud: [CLIENT_ID, "geoplus"] }))));
  await refused(check(es256(HEADER, idClaims({ aud: "geoplus" }))));
});

test("id_f: alg HS256 is refused, also when signed with the client secret", async () => {
  const header = { alg: "HS256", typ: "JWT", kid: KID };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(idClaims()))}`;
  const mac = createHmac("sha256", config().clientSecret).update(input).digest();
  await refused(check(`${input}.${b64u(mac)}`));
  await refused(check(es256({ alg: "none", typ: "JWT", kid: KID }, idClaims())));
  await refused(check(es256({ alg: "ES256", typ: "at+jwt", kid: KID }, idClaims())));
});

test("id_f: signature, key and issuer checks", async () => {
  await refused(check(es256(HEADER, idClaims(), other.privateKey)));
  await refused(check(es256({ ...HEADER, kid: "unknown" }, idClaims())));
  await refused(check(es256(HEADER, idClaims({ iss: "http://evil.example" }))));
  const token = es256(HEADER, idClaims());
  const [h, , s] = token.split(".");
  await refused(check(`${h}.${b64u(JSON.stringify(idClaims({ sub: "someone-else" })))}.${s}`));
  for (const junk of ["", "a.b", "a.b.c", "....", "x".repeat(20000)]) await refused(check(junk));
});

test("id_f: time checks (30 s allowance, exp - iat exactly 300, token_use id, sub)", async () => {
  await refused(check(es256(HEADER, idClaims({ iat: NOW - 400, exp: NOW - 100 }))));
  await refused(check(es256(HEADER, idClaims({ iat: NOW - 330, exp: NOW - 30 }))));
  assert.ok(await check(es256(HEADER, idClaims({ iat: NOW - 329, exp: NOW - 29 }))));
  await refused(check(es256(HEADER, idClaims({ iat: NOW + 31, exp: NOW + 331 }))));
  await refused(check(es256(HEADER, idClaims({ exp: NOW + 3600 }))));
  await refused(check(es256(HEADER, idClaims({ token_use: "access" }))));
  await refused(check(es256(HEADER, idClaims({ sub: 42 }))));
  await refused(check(es256(HEADER, idClaims({ exp: "soon" }))));
});

// ---------------------------------------------------------------------------------------------
// Key set cache (freshness.md FRESH-12)
// ---------------------------------------------------------------------------------------------

test("createKeySetCache: fetches once, keeps only ES256 signing keys, refetches an unknown kid at most once per 60 s", async () => {
  let now = NOW;
  const calls: Call[] = [];
  const jwks = {
    keys: [
      publicJwk(signer.publicKey, KID),
      { ...publicJwk(other.publicKey, "enc-key"), use: "enc" },
      { ...publicJwk(other.publicKey, "rsa-ish"), alg: "RS256" },
    ],
  };
  const fetchFn = fakeFetch([json(200, jwks), json(200, jwks), json(200, jwks)], calls);
  const cache = createKeySetCache({ issuer: ISSUER, fetch: fetchFn, now: () => now });
  assert.ok(await cache.getKey(KID));
  assert.ok(await cache.getKey(KID));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ISSUER}/.well-known/jwks.json`);
  assert.equal(await cache.getKey("enc-key"), null);
  assert.equal(await cache.getKey("rsa-ish"), null);
  assert.equal(calls.length, 1, "unknown kid within 60 s of the last fetch: no refetch");
  now += 61;
  assert.equal(await cache.getKey("brand-new"), null);
  assert.equal(calls.length, 2);
  now += 3600;
  assert.ok(await cache.getKey(KID));
  assert.equal(calls.length, 3, "refetched after 60 minutes");
});

test("createKeySetCache: a failed fetch keeps the set it has; a new set replaces the old one completely", async () => {
  let now = NOW;
  const fetchFn = fakeFetch([
    json(200, { keys: [publicJwk(signer.publicKey, KID)] }),
    new Error("down"),
    json(200, { keys: [publicJwk(other.publicKey, "kid-next")] }),
  ]);
  const cache = createKeySetCache({ issuer: ISSUER, fetch: fetchFn, now: () => now });
  assert.ok(await cache.getKey(KID));
  now += 3601;
  assert.ok(await cache.getKey(KID), "kept after a failed fetch");
  now += 61;
  assert.ok(await cache.getKey("kid-next"));
  assert.equal(await cache.getKey(KID), null, "a key missing from the newest set is no longer trusted");
});

// ---------------------------------------------------------------------------------------------
// The callback (identity.md 5.1 steps 4 and 5)
// ---------------------------------------------------------------------------------------------

test("finishSignIn: exchanges the code with Basic auth and the PKCE verifier, checks the ID token, builds the session", async () => {
  const calls: Call[] = [];
  const result = await finishSignIn(
    config(),
    pending(),
    { code: "code-1", state: "state-1", error: null },
    { fetch: fakeFetch([json(200, tokenAnswer())], calls), now: () => NOW, keys },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ISSUER}/oauth/token`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(headerOf(calls[0], "authorization"), `Basic ${Buffer.from(`${CLIENT_ID}:fake-secret-geoplus-web-dev`).toString("base64")}`);
  assert.equal(headerOf(calls[0], "content-type"), "application/x-www-form-urlencoded");
  const form = formOf(calls[0]);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "code-1");
  assert.equal(form.get("redirect_uri"), "http://localhost:3001/auth/callback");
  assert.equal(form.get("code_verifier"), "v".repeat(86));
  assert.equal(form.get("client_secret"), null, "the secret goes only in the Authorization header");
  assert.equal(result.sub, USER);
  assert.equal(result.sid, SID);
  assert.equal(result.name, "Amina Rahman");
  assert.equal(result.email, "amina@example.test");
  assert.equal(result.org, ORG);
  assert.equal(result.accessToken, "access-token-1");
  assert.equal(result.refreshToken, "spr_refresh-1");
  assert.equal(result.accessIssuedAt, NOW);
  assert.equal(result.accessExpiresAt, NOW + 300);
  assert.equal(result.signedInAt, NOW);
});

test("finishSignIn: a lifetime over 300 s is capped (FRESH-1)", async () => {
  const result = await finishSignIn(
    config(),
    pending(),
    { code: "c", state: "state-1" },
    { fetch: fakeFetch([json(200, tokenAnswer({ expires_in: 3600 }))]), now: () => NOW, keys },
  );
  assert.equal(result.accessExpiresAt, NOW + 300);
});

test("finishSignIn: wrong or missing state, an expired sign-in, an Account error and no code never call Account", async () => {
  const calls: Call[] = [];
  const deps = { fetch: fakeFetch([], calls), now: () => NOW, keys };
  await refused(finishSignIn(config(), pending(), { code: "c", state: "state-2" }, deps), "state_invalid");
  await refused(finishSignIn(config(), pending(), { code: "c", state: "" }, deps), "state_invalid");
  await refused(finishSignIn(config(), pending(), { code: "c", state: null }, deps), "state_invalid");
  await refused(finishSignIn(config(), pending({ createdAt: NOW - 601 }), { code: "c", state: "state-1" }, deps), "state_invalid");
  await refused(finishSignIn(config(), pending(), { code: "c", state: "state-1", error: "access_denied" }, deps), "access_denied");
  await refused(finishSignIn(config(), pending(), { code: "", state: "state-1" }, deps), "code_invalid");
  assert.equal(calls.length, 0);
});

test("finishSignIn: Account refusal is a SignInError; 5xx and network failures are AccountUnavailableError", async () => {
  const deps = (answer: Response | Error) => ({ fetch: fakeFetch([answer]), now: () => NOW, keys });
  await refused(
    finishSignIn(config(), pending(), { code: "c", state: "state-1" }, deps(json(400, { error: "invalid_grant", code: "code_invalid" }))),
    "code_invalid",
  );
  await assert.rejects(finishSignIn(config(), pending(), { code: "c", state: "state-1" }, deps(json(503, {}))), AccountUnavailableError);
  await assert.rejects(finishSignIn(config(), pending(), { code: "c", state: "state-1" }, deps(new TypeError("fetch failed"))), AccountUnavailableError);
  await assert.rejects(
    finishSignIn(config(), pending(), { code: "c", state: "state-1" }, deps(new Response("<html>", { status: 200 }))),
    AccountUnavailableError,
  );
});

test("finishSignIn: the ID token is checked against this sign-in's nonce", async () => {
  const answer = tokenAnswer({ id_token: es256(HEADER, idClaims({ nonce: "other" })) });
  await refused(finishSignIn(config(), pending(), { code: "c", state: "state-1" }, { fetch: fakeFetch([json(200, answer)]), now: () => NOW, keys }));
  const noId = tokenAnswer({ id_token: undefined });
  await refused(finishSignIn(config(), pending(), { code: "c", state: "state-1" }, { fetch: fakeFetch([json(200, noId)]), now: () => NOW, keys }));
});

// ---------------------------------------------------------------------------------------------
// Renewal (ID-37, ID-38, FRESH-1)
// ---------------------------------------------------------------------------------------------

test("refreshSession: rotation saved before use", async () => {
  const events: string[] = [];
  const calls: Call[] = [];
  const renewed = await refreshSession(config(), session(), {
    fetch: fakeFetch([json(200, { access_token: "access-token-2", refresh_token: "spr_refresh-2", expires_in: 300, organisation_id: ORG })], calls),
    now: () => NOW,
    save: (next) => events.push(`save:${next.refreshToken}`),
  });
  events.push(`use:${renewed.accessToken}`);
  assert.deepEqual(events.slice(0, 1), ["save:spr_refresh-2"]);
  assert.equal(events.at(-1), "use:access-token-2");
  const form = formOf(calls[0]);
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), "spr_refresh-1");
  assert.equal(renewed.refreshToken, "spr_refresh-2");
  assert.equal(renewed.accessIssuedAt, NOW);
  assert.equal(renewed.accessExpiresAt, NOW + 300);
  assert.equal(renewed.idToken, "id-token-1", "the ID token is kept for sign-out");
  assert.equal(renewed.signedInAt, NOW - 100);
});

test("refreshSession: the new refresh token is saved even when the rest of the answer is unusable", async () => {
  const saved: string[] = [];
  await assert.rejects(
    refreshSession(config(), session(), {
      fetch: fakeFetch([json(200, { refresh_token: "spr_refresh-2" })]),
      now: () => NOW,
      save: (next) => saved.push(next.refreshToken),
    }),
    AccountUnavailableError,
  );
  assert.deepEqual(saved, ["spr_refresh-2"]);
});

test("refreshSession: invalid_grant ends the session; organisation_access_ended and 5xx do not", async () => {
  const run = (answer: Response | Error) =>
    refreshSession(config(), session(), { fetch: fakeFetch([answer]), now: () => NOW, save: () => assert.fail("nothing to save") });
  await assert.rejects(run(json(400, { error: "invalid_grant", code: "refresh_token_reused" })), (e: unknown) => e instanceof SignInError && e.endsSession);
  await assert.rejects(
    run(json(400, { error: "invalid_grant", code: "organisation_access_ended" })),
    (e: unknown) => e instanceof SignInError && !e.endsSession,
  );
  await assert.rejects(run(json(502, { error: "x" })), AccountUnavailableError);
  await assert.rejects(run(new Error("ECONNREFUSED")), AccountUnavailableError);
  await assert.rejects(run(json(200, { access_token: "a" })), AccountUnavailableError);
});

test("createRefreshCoordinator: one refresh at a time per session; a late request with the old token gets the stored answer", async () => {
  let now = NOW;
  const calls: Call[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const answer = json(200, { access_token: "access-token-2", refresh_token: "spr_refresh-2", expires_in: 300 });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    await gate;
    return answer;
  }) as typeof fetch;
  const coordinator = createRefreshCoordinator();
  const savedA: string[] = [];
  const savedB: string[] = [];
  const a = coordinator.refresh(config(), session(), { fetch: fetchFn, now: () => now, save: (s) => savedA.push(s.refreshToken) });
  const b = coordinator.refresh(config(), session(), { fetch: fetchFn, now: () => now, save: (s) => savedB.push(s.refreshToken) });
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls.length, 1, "the second request waited for the first");
  assert.equal(ra.refreshToken, "spr_refresh-2");
  assert.equal(rb.refreshToken, "spr_refresh-2");
  assert.ok(savedA.includes("spr_refresh-2") && savedB.includes("spr_refresh-2"), "both responses carry the new cookie");

  now += 20;
  const late = await coordinator.refresh(config(), session(), { fetch: fakeFetch([]), now: () => now, save: () => {} });
  assert.equal(late.refreshToken, "spr_refresh-2");
  assert.equal(calls.length, 1);

  now += 20; // 40 s after the answer: the memo is gone, the old token goes to Account (which refuses it)
  await assert.rejects(
    coordinator.refresh(config(), session(), {
      fetch: fakeFetch([json(400, { error: "invalid_grant", code: "refresh_token_reused" })]),
      now: () => now,
      save: () => {},
    }),
    SignInError,
  );
});

test("ensureFreshSession: no cookie, fresh, due for renewal, ended, Account down", async () => {
  const cfg = config();
  const coordinator = createRefreshCoordinator();
  const none = await ensureFreshSession(cfg, undefined, { fetch: fakeFetch([]), now: () => NOW, coordinator });
  assert.equal(none.outcome, "none");
  assert.equal(none.setCookie, undefined);

  // Issued NOW-100, expires NOW+200: 4/5 of 300 s is NOW+140, so not due yet.
  const fresh = await ensureFreshSession(cfg, sealSession(cfg, session()), { fetch: fakeFetch([]), now: () => NOW, coordinator });
  assert.equal(fresh.outcome, "ok");
  assert.equal(fresh.session?.accessToken, "access-token-1");
  assert.equal(fresh.setCookie, undefined);

  const due = session({ accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 });
  const renewed = await ensureFreshSession(cfg, sealSession(cfg, due), {
    fetch: fakeFetch([json(200, { access_token: "access-token-2", refresh_token: "spr_refresh-2", expires_in: 300 })]),
    now: () => NOW,
    coordinator,
  });
  assert.equal(renewed.outcome, "renewed");
  assert.equal(typeof renewed.setCookie, "string");
  assert.equal(unsealSession(cfg, renewed.setCookie as string)?.refreshToken, "spr_refresh-2");
  assert.equal(renewed.session?.accessToken, "access-token-2");

  const ended = await ensureFreshSession(cfg, sealSession(cfg, session({ refreshToken: "spr_dead", accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 })), {
    fetch: fakeFetch([json(400, { error: "invalid_grant", code: "refresh_token_invalid" })]),
    now: () => NOW,
    coordinator,
  });
  assert.equal(ended.outcome, "signed_out");
  assert.equal(ended.setCookie, null);
  assert.equal(ended.session, null);

  const down = await ensureFreshSession(cfg, sealSession(cfg, session({ refreshToken: "spr_other", accessIssuedAt: NOW - 250, accessExpiresAt: NOW + 50 })), {
    fetch: fakeFetch([new Error("down")]),
    now: () => NOW,
    coordinator,
  });
  assert.equal(down.outcome, "unavailable");
  assert.equal(down.setCookie, undefined, "the session is kept to try again later");

  const tooOld = await ensureFreshSession(cfg, sealSession(cfg, session({ signedInAt: NOW - 31 * 24 * 3600 })), {
    fetch: fakeFetch([]),
    now: () => NOW,
    coordinator,
  });
  assert.equal(tooOld.outcome, "signed_out");

  const junk = await ensureFreshSession(cfg, "garbage", { fetch: fakeFetch([]), now: () => NOW, coordinator });
  assert.equal(junk.outcome, "signed_out");
  assert.equal(junk.setCookie, null);
});

// ---------------------------------------------------------------------------------------------
// Sign-out, user, CSRF
// ---------------------------------------------------------------------------------------------

test("endSessionUrl: id_token_hint, client_id, the registered sign-out address and state", () => {
  const url = new URL(endSessionUrl(config(), "id-token-1", "st"));
  assert.equal(`${url.origin}${url.pathname}`, `${ISSUER}/oauth/end-session`);
  assert.equal(url.searchParams.get("id_token_hint"), "id-token-1");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("post_logout_redirect_uri"), "http://localhost:3001/auth/signed-out");
  assert.equal(url.searchParams.get("state"), "st");
  assert.equal(new URL(endSessionUrl(config(), null, "st")).searchParams.get("id_token_hint"), null);
});

test("sessionUser: only profile fields, never a token", () => {
  const user = sessionUser(session());
  assert.deepEqual(user, { id: USER, name: "Amina Rahman", email: "amina@example.test" });
  assert.ok(!JSON.stringify(user).includes("token"));
});

test("isSameOriginRequest: Origin must be ours; without Origin, Sec-Fetch-Site must say same-origin", () => {
  const ours = ["http://localhost:3001"];
  assert.equal(isSameOriginRequest(new Headers({ origin: "http://localhost:3001" }), ours), true);
  assert.equal(isSameOriginRequest(new Headers({ origin: "http://localhost:3010" }), ours), false);
  assert.equal(isSameOriginRequest(new Headers({ origin: "null" }), ours), false);
  assert.equal(isSameOriginRequest(new Headers({ "sec-fetch-site": "same-origin" }), ours), true);
  assert.equal(isSameOriginRequest(new Headers({ "sec-fetch-site": "cross-site" }), ours), false);
  assert.equal(isSameOriginRequest(new Headers(), ours), false);
});
