/**
 * GeoPlus as a Spadace Account web client (plan P3-b3; contracts/identity.md sections 5, 7.2, 7.7, 11;
 * ID-25 to ID-30, ID-37, ID-38; freshness.md FRESH-1, FRESH-2, FRESH-12). Server-only: imported by route
 * handlers and server components, never by client components.
 *
 * The same steps as the Python SDK's `SignOnClient` (account/sdk/python/src/spadace_account/webclient.py),
 * written with Node's built-in `crypto` and `fetch` (no new dependency):
 *
 * 1. `beginSignIn`: random `state`, `nonce` and PKCE verifier (S256), kept in a short-lived sealed cookie
 *    (`geoplus_login`, 10 min), and the browser goes to Account's authorise address.
 * 2. `finishSignIn` (at `/auth/callback`): checks `state`, exchanges the code with the client secret (HTTP Basic)
 *    and the verifier, checks the ID token (ES256 with a key of Account's key set, `iss`, `aud` equal to the
 *    client ID as one string, `nonce`, `exp`/`iat` with 30 s allowance and `exp - iat` = 300, `token_use` id).
 * 3. The tokens live in a **sealed** cookie (AES-256-GCM, key from env, HttpOnly, host-only, SameSite=Lax,
 *    path `/`, Secure outside dev; owner decision B4 / P3-D15: a sealed HttpOnly cookie is GeoPlus's
 *    server-side token store, ID-28). Browser JavaScript never sees a token.
 * 4. `ensureFreshSession`: renewal at four fifths of the access token's life (FRESH-1). The new refresh token
 *    is saved (written to the response cookie) before the new access token is used (ID-37).
 * 5. Sign-out: revoke the refresh token, clear the cookie, send the browser to Account's end-session address.
 *
 * The access token's audience (`geoplus`) is hosted by core, not by this app, so GeoPlus treats it as opaque and
 * times it by `expires_in` (at most 300 s), as the SDK does for an audience it does not host; core verifies it.
 *
 * One refresh at a time per session (ID-37), as far as a cookie store allows: within one server process,
 * `createRefreshCoordinator` lets concurrent requests carrying the same refresh token share one call to Account,
 * and answers a request that arrives up to 30 s later with the old token from memory instead of sending the
 * old token again. Limitation: separate server processes (several instances behind a load balancer) do not share
 * this. Two instances may then both refresh one token; Account's 30-second retry window (ID-38) makes both calls
 * succeed, but only the later answer's refresh token lives, and the browser keeps whichever cookie arrived last.
 * If that is the rotated-out one, the next renewal ends the sign-in (`refresh_token_reused`) and the person signs
 * in again through single sign-on. A shared store (Redis) per app is the documented fallback (B4).
 *
 * Nothing here logs. Errors carry stable codes only, never a token, code, secret or key.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

import { isUuid, sanitizeNextPath } from "@/lib/geoplus/auth";

export const SCOPE = "openid profile email";
/** How long a sign-in may take between start and callback (the product's own limit, as in the SDK). */
export const PENDING_LIFETIME_SECONDS = 600;
/** FRESH-2. */
export const CLOCK_SKEW_SECONDS = 30;
/** identity.md 7.2: `exp - iat` of an ID token is exactly 300. */
export const ID_TOKEN_LIFETIME_SECONDS = 300;
/** FRESH-1: an access token lives at most 300 s; renew at four fifths. */
export const ACCESS_TOKEN_MAX_LIFETIME_SECONDS = 300;
export const RENEW_FRACTION = 0.8;
/** ID-39: a sign-in lasts at most 30 days in all. */
export const SIGN_IN_MAX_LIFETIME_SECONDS = 30 * 24 * 3600;
/** ID-38: the token used immediately before stays usable for 30 s. */
export const REFRESH_REUSE_WINDOW_SECONDS = 30;
/** Browsers keep about 4096 bytes per cookie including its name and attributes. */
export const MAX_SEALED_COOKIE_LENGTH = 3800;

const KEY_SET_MAX_AGE_SECONDS = 3600; // FRESH-12: at least every 60 minutes
const KEY_SET_UNKNOWN_KID_INTERVAL_SECONDS = 60; // FRESH-12: at most once per 60 seconds
const MAX_JWT_LENGTH = 16_384;
const HTTP_TIMEOUT_MS = 10_000;
const SEAL_VERSION = "v1";

const DEV_ISSUER = "http://localhost:8050";
const DEV_CLIENT_ID = "geoplus-web-dev";
const DEV_REDIRECT_URI = "http://localhost:3001/auth/callback";
const DEV_SIGNED_OUT_URI = "http://localhost:3001/auth/signed-out";

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------

export type AccountClientConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  signedOutUri: string;
  /** Sealing keys, 32 bytes each. The first seals; all are tried when unsealing (key rotation). */
  keys: Buffer[];
  secureCookies: boolean;
};

export class AccountConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountConfigError";
  }
}

type Env = Record<string, string | undefined>;

function setting(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function absoluteUrl(value: string, name: string, requireHttps: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AccountConfigError(`${name} is not an absolute URL`);
  }
  if (url.protocol !== "https:" && (requireHttps || url.protocol !== "http:")) {
    throw new AccountConfigError(`${name} must use https`);
  }
  return url.toString().replace(/\/$/, "");
}

function sealingKey(value: string, name: string): Buffer {
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) {
    throw new AccountConfigError(`${name} must be 32 random bytes, base64url (openssl rand -base64 32)`);
  }
  return key;
}

/**
 * Settings from the environment. Development defaults: Account API on 8050, client `geoplus-web-dev`, return
 * address `http://localhost:3001/auth/callback` (contracts/products.toml). In production every address must be
 * given, use https, and the client must not be a development client (REG-10).
 */
export function readAccountConfig(env: Env): AccountClientConfig {
  const production = env.NODE_ENV === "production";
  const need = (name: string, devDefault: string): string => {
    const value = setting(env, name);
    if (value) return value;
    if (production) throw new AccountConfigError(`${name} is required in production`);
    return devDefault;
  };
  const issuer = absoluteUrl(need("ACCOUNT_ISSUER", DEV_ISSUER), "ACCOUNT_ISSUER", production);
  const clientId = need("ACCOUNT_WEB_CLIENT_ID", DEV_CLIENT_ID);
  if (production && clientId.endsWith("-dev")) {
    throw new AccountConfigError("a development web client in production (REG-10)");
  }
  const clientSecret = setting(env, "ACCOUNT_WEB_CLIENT_SECRET");
  if (!clientSecret) throw new AccountConfigError("ACCOUNT_WEB_CLIENT_SECRET is required (ID-28)");
  const redirectUri = absoluteUrl(need("ACCOUNT_WEB_REDIRECT_URI", DEV_REDIRECT_URI), "ACCOUNT_WEB_REDIRECT_URI", production);
  const signedOutUri = absoluteUrl(
    need("ACCOUNT_WEB_SIGNED_OUT_URI", DEV_SIGNED_OUT_URI),
    "ACCOUNT_WEB_SIGNED_OUT_URI",
    production,
  );
  const current = setting(env, "GEOPLUS_SESSION_KEY");
  if (!current) throw new AccountConfigError("GEOPLUS_SESSION_KEY is required");
  const keys = [sealingKey(current, "GEOPLUS_SESSION_KEY")];
  for (const previous of (setting(env, "GEOPLUS_SESSION_PREVIOUS_KEYS") ?? "").split(",")) {
    if (previous.trim()) keys.push(sealingKey(previous.trim(), "GEOPLUS_SESSION_PREVIOUS_KEYS"));
  }
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    signedOutUri,
    keys,
    secureCookies: production || redirectUri.startsWith("https:"),
  };
}

/** `readAccountConfig(process.env)`, or null when sign-in is not configured. */
export function loadAccountConfig(): AccountClientConfig | null {
  try {
    return readAccountConfig(process.env);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------

/**
 * Account refused, or a check failed. `code` is Account's stable code (ID-55) or one of `state_invalid`,
 * `id_token_invalid`, `code_invalid`. `endsSession`: the refresh token is spent (sign in again).
 */
export class SignInError extends Error {
  readonly code: string;
  readonly endsSession: boolean;

  constructor(code: string, endsSession: boolean) {
    super(code);
    this.name = "SignInError";
    this.code = code;
    this.endsSession = endsSession;
  }
}

/** Account cannot be reached or answered 5xx / something unreadable. Keep the session; try again later. */
export class AccountUnavailableError extends Error {
  constructor(message = "account_unavailable") {
    super(message);
    this.name = "AccountUnavailableError";
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

const b64u = (raw: Buffer) => raw.toString("base64url");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const optionalString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** RFC 7636 `S256` (ID-25). */
export function pkceChallenge(verifier: string): string {
  return b64u(createHash("sha256").update(verifier, "ascii").digest());
}

// ---------------------------------------------------------------------------------------------------------------
// Sealing (AES-256-GCM, P3-D15)
// ---------------------------------------------------------------------------------------------------------------

export type SealPurpose = "session" | "login";

const aad = (purpose: SealPurpose) => Buffer.from(`geoplus:${purpose}:${SEAL_VERSION}`);

/** `v1.<iv>.<ciphertext + tag>`, bound to its purpose so a login value never opens as a session. */
export function seal(value: unknown, purpose: SealPurpose, keys: Buffer[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys[0], iv);
  cipher.setAAD(aad(purpose));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${SEAL_VERSION}.${b64u(iv)}.${b64u(body)}`;
}

/** The value, or null for anything not sealed by one of `keys` for `purpose`. Never throws. */
export function unseal(sealed: string | null | undefined, purpose: SealPurpose, keys: Buffer[]): unknown {
  if (typeof sealed !== "string" || sealed.length > MAX_SEALED_COOKIE_LENGTH * 2) return null;
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== SEAL_VERSION) return null;
  const iv = Buffer.from(parts[1], "base64url");
  const body = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || body.length < 17) return null;
  const ciphertext = body.subarray(0, body.length - 16);
  const tag = body.subarray(body.length - 16);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(aad(purpose));
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      return JSON.parse(plain) as unknown;
    } catch {
      // wrong key or tampered: try the next key
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Session and pending sign-in
// ---------------------------------------------------------------------------------------------------------------

/** What the sealed session cookie holds. Times are seconds since the epoch. */
export type AccountSession = {
  v: 1;
  sub: string;
  sid: string | null;
  name: string | null;
  email: string | null;
  org: string | null;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accessIssuedAt: number;
  accessExpiresAt: number;
  signedInAt: number;
};

/** What the login cookie holds between `beginSignIn` and the callback. */
export type PendingSignIn = {
  state: string;
  nonce: string;
  verifier: string;
  createdAt: number;
  next: string;
};

export function sealSession(config: AccountClientConfig, session: AccountSession): string {
  const sealed = seal(session, "session", config.keys);
  if (sealed.length > MAX_SEALED_COOKIE_LENGTH) throw new Error("session too large for a cookie");
  return sealed;
}

const isNullableString = (value: unknown) => value === null || typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function unsealSession(config: AccountClientConfig, sealed: string | null | undefined): AccountSession | null {
  const value = unseal(sealed, "session", config.keys);
  if (!isRecord(value) || value.v !== 1) return null;
  const { sub, sid, name, email, org, accessToken, refreshToken, idToken, accessIssuedAt, accessExpiresAt, signedInAt } =
    value;
  if (
    typeof sub !== "string" ||
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    typeof idToken !== "string" ||
    !isNullableString(sid) ||
    !isNullableString(name) ||
    !isNullableString(email) ||
    !isNullableString(org) ||
    !isNumber(accessIssuedAt) ||
    !isNumber(accessExpiresAt) ||
    !isNumber(signedInAt)
  ) {
    return null;
  }
  return {
    v: 1,
    sub,
    sid: sid as string | null,
    name: name as string | null,
    email: email as string | null,
    org: org as string | null,
    accessToken,
    refreshToken,
    idToken,
    accessIssuedAt,
    accessExpiresAt,
    signedInAt,
  };
}

export function unsealPending(config: AccountClientConfig, sealed: string | null | undefined): PendingSignIn | null {
  const value = unseal(sealed, "login", config.keys);
  if (!isRecord(value)) return null;
  const { state, nonce, verifier, createdAt, next } = value;
  if (
    typeof state !== "string" ||
    typeof nonce !== "string" ||
    typeof verifier !== "string" ||
    typeof next !== "string" ||
    !isNumber(createdAt)
  ) {
    return null;
  }
  return { state, nonce, verifier, createdAt, next };
}

/** The signed-in person for display. Profile fields only, never a token. */
export function sessionUser(session: AccountSession): { id: string; name: string; email: string } {
  return { id: session.sub, name: session.name ?? "", email: session.email ?? "" };
}

// ---------------------------------------------------------------------------------------------------------------
// Cookies (ID-29: HttpOnly, SameSite=Lax, no Domain; Secure outside dev; one name per application)
// ---------------------------------------------------------------------------------------------------------------

export type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
};

export type CookieSpec = { name: string; value: string; options: CookieOptions };

const cookieName = (config: AccountClientConfig, base: string) => (config.secureCookies ? `__Host-${base}` : base);

export const sessionCookieName = (config: AccountClientConfig) => cookieName(config, "geoplus_session");
export const loginCookieName = (config: AccountClientConfig) => cookieName(config, "geoplus_login");

function cookieOptions(config: AccountClientConfig, maxAge: number): CookieOptions {
  return { httpOnly: true, sameSite: "lax", path: "/", secure: config.secureCookies, maxAge: Math.max(0, Math.floor(maxAge)) };
}

/** The session cookie with `value` (sealed), or a clearing cookie when `value` is null. Lives until the sign-in's 30 days end. */
export function sessionCookie(config: AccountClientConfig, value: string | null, now: number, signedInAt: number): CookieSpec {
  const maxAge = value === null ? 0 : signedInAt + SIGN_IN_MAX_LIFETIME_SECONDS - now;
  return { name: sessionCookieName(config), value: value ?? "", options: cookieOptions(config, maxAge) };
}

export function loginCookie(config: AccountClientConfig, value: string | null): CookieSpec {
  return {
    name: loginCookieName(config),
    value: value ?? "",
    options: cookieOptions(config, value === null ? 0 : PENDING_LIFETIME_SECONDS),
  };
}

/**
 * Cross-site request forgery guard for requests that change something (ID-29): `Origin` must be one of ours;
 * without `Origin`, the browser's `Sec-Fetch-Site` must say same-origin.
 */
export function isSameOriginRequest(headers: Headers, allowedOrigins: string[]): boolean {
  const origin = headers.get("origin");
  if (origin !== null) return allowedOrigins.includes(origin);
  return headers.get("sec-fetch-site") === "same-origin";
}

// ---------------------------------------------------------------------------------------------------------------
// Account's key set (identity.md 7.8, FRESH-12)
// ---------------------------------------------------------------------------------------------------------------

export type KeySetCache = { getKey(kid: string): Promise<KeyObject | null> };

function parseKeySet(body: unknown): Map<string, KeyObject> | null {
  if (!isRecord(body) || !Array.isArray(body.keys)) return null;
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys) {
    if (!isRecord(jwk)) continue;
    // identity.md 7.8: keep only keys with exactly these values.
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.alg !== "ES256" || jwk.use !== "sig") continue;
    if (typeof jwk.kid !== "string" || typeof jwk.x !== "string" || typeof jwk.y !== "string") continue;
    try {
      keys.set(jwk.kid, createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" }));
    } catch {
      // not a usable P-256 point
    }
  }
  return keys;
}

/**
 * In-memory key set: fetched on first use, again after 60 minutes, and for an unknown `kid` at most once per
 * 60 seconds. A failed fetch keeps the set it has; a new set replaces the old one completely.
 */
export function createKeySetCache(options: { issuer: string; fetch: typeof fetch; now: () => number }): KeySetCache {
  let keys: Map<string, KeyObject> | null = null;
  let fetchedAt = -Infinity;
  let lastAttempt = -Infinity;
  let loading: Promise<void> | null = null;

  const load = (at: number): Promise<void> => {
    if (loading) return loading;
    lastAttempt = at;
    loading = (async () => {
      try {
        const response = await options.fetch(`${options.issuer}/.well-known/jwks.json`, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        if (!response.ok) return;
        const parsed = parseKeySet(await response.json());
        if (parsed) {
          keys = parsed;
          fetchedAt = at;
        }
      } catch {
        // keep the set we have
      } finally {
        loading = null;
      }
    })();
    return loading;
  };

  return {
    async getKey(kid: string) {
      const at = options.now();
      if (keys === null || (at - fetchedAt >= KEY_SET_MAX_AGE_SECONDS && at - lastAttempt >= KEY_SET_UNKNOWN_KID_INTERVAL_SECONDS)) {
        await load(at);
      }
      const current = keys as Map<string, KeyObject> | null;
      const found = current?.get(kid);
      if (found) return found;
      if (at - lastAttempt >= KEY_SET_UNKNOWN_KID_INTERVAL_SECONDS) {
        await load(at);
        return (keys as Map<string, KeyObject> | null)?.get(kid) ?? null;
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// ID token (identity.md 5.1 step 5, 7.2)
// ---------------------------------------------------------------------------------------------------------------

export type IdTokenClaims = Record<string, unknown> & { sub: string; sid?: unknown; name?: unknown; email?: unknown };

function decodeJson(part: string): unknown {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function checkIdToken(
  idToken: string,
  options: { issuer: string; clientId: string; nonce: string; now: number; keys: KeySetCache },
): Promise<IdTokenClaims> {
  const bad = () => new SignInError("id_token_invalid", true);
  if (typeof idToken !== "string" || !idToken || idToken.length > MAX_JWT_LENGTH) throw bad();
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw bad();
  const header = decodeJson(parts[0]);
  // The algorithm comes from here, never from the token: only ES256 with typ JWT (ID-34).
  if (!isRecord(header) || header.alg !== "ES256" || header.typ !== "JWT" || typeof header.kid !== "string") throw bad();
  const key = await options.keys.getKey(header.kid);
  if (!key) throw bad();
  const signature = Buffer.from(parts[2], "base64url");
  if (signature.length !== 64) throw bad();
  let valid = false;
  try {
    valid = verifySignature(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key, dsaEncoding: "ieee-p1363" },
      signature,
    );
  } catch {
    valid = false;
  }
  if (!valid) throw bad();
  const claims = decodeJson(parts[1]);
  if (!isRecord(claims)) throw bad();
  const { iss, sub, aud, exp, iat, nonce } = claims;
  if (iss !== options.issuer) throw bad();
  if (typeof sub !== "string" || !sub) throw bad();
  if (typeof aud !== "string" || aud !== options.clientId) throw bad(); // ID-30: one string, never a list
  if (claims.token_use !== "id") throw bad();
  if (typeof nonce !== "string" || !sameString(nonce, options.nonce)) throw bad();
  if (!isNumber(exp) || exp + CLOCK_SKEW_SECONDS <= options.now) throw bad();
  if (!isNumber(iat) || iat > options.now + CLOCK_SKEW_SECONDS) throw bad();
  if (exp - iat !== ID_TOKEN_LIFETIME_SECONDS) throw bad();
  return claims as IdTokenClaims;
}

// ---------------------------------------------------------------------------------------------------------------
// Account's token endpoint (identity.md 11.2)
// ---------------------------------------------------------------------------------------------------------------

function basicAuth(config: AccountClientConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

async function tokenRequest(
  config: AccountClientConfig,
  form: Record<string, string>,
  fetchFn: typeof fetch,
  endsOnGrantError: boolean,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchFn(`${config.issuer}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(config),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new AccountUnavailableError();
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status >= 500 || !isRecord(body)) throw new AccountUnavailableError();
  if (response.status === 200) return body;
  const error = typeof body.error === "string" ? body.error : "";
  const code = (typeof body.code === "string" && body.code) || error || "invalid_request";
  // A refused switch or audience spends nothing (Account checks before it rotates).
  const spent = endsOnGrantError && error === "invalid_grant" && code !== "organisation_access_ended";
  throw new SignInError(code, spent);
}

function accessFrom(answer: Record<string, unknown>, now: number) {
  const accessToken = answer.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new AccountUnavailableError();
  const lifetime = isNumber(answer.expires_in) && answer.expires_in > 0 ? answer.expires_in : ACCESS_TOKEN_MAX_LIFETIME_SECONDS;
  return {
    accessToken,
    accessIssuedAt: now,
    accessExpiresAt: now + Math.min(lifetime, ACCESS_TOKEN_MAX_LIFETIME_SECONDS),
    org: isUuid(answer.organisation_id) ? answer.organisation_id : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------------------------------------------

/** 5.1 step 1: the authorise address and what to keep (sealed in the login cookie). */
export function beginSignIn(
  config: AccountClientConfig,
  options: { next?: unknown; organisation?: unknown },
  now: number,
): { url: string; pending: PendingSignIn } {
  const pending: PendingSignIn = {
    state: b64u(randomBytes(32)),
    nonce: b64u(randomBytes(32)),
    verifier: b64u(randomBytes(64)), // 86 characters; RFC 7636 allows 43 to 128
    createdAt: now,
    next: sanitizeNextPath(options.next),
  };
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPE,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: pkceChallenge(pending.verifier),
    code_challenge_method: "S256",
  });
  if (isUuid(options.organisation)) params.set("organisation", options.organisation);
  return { url: `${config.issuer}/oauth/authorize?${params.toString()}`, pending };
}

export type SignInDeps = { fetch: typeof fetch; now: () => number; keys: KeySetCache };

/** 5.1 steps 4 and 5. `pending` is what this browser's login cookie held. */
export async function finishSignIn(
  config: AccountClientConfig,
  pending: PendingSignIn,
  query: { code?: string | null; state?: string | null; error?: string | null },
  deps: SignInDeps,
): Promise<AccountSession> {
  const now = deps.now();
  // ID-25: the callback must carry this browser's `state`, and soon.
  if (!query.state || !sameString(query.state, pending.state)) throw new SignInError("state_invalid", false);
  if (now >= pending.createdAt + PENDING_LIFETIME_SECONDS) throw new SignInError("state_invalid", false);
  if (query.error) throw new SignInError(query.error, false);
  if (!query.code) throw new SignInError("code_invalid", false);
  const answer = await tokenRequest(
    config,
    {
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: config.redirectUri,
      code_verifier: pending.verifier,
    },
    deps.fetch,
    false,
  );
  const access = accessFrom(answer, now);
  const refreshToken = answer.refresh_token;
  if (typeof refreshToken !== "string" || !refreshToken) throw new AccountUnavailableError();
  const idToken = typeof answer.id_token === "string" ? answer.id_token : "";
  const claims = await checkIdToken(idToken, {
    issuer: config.issuer,
    clientId: config.clientId,
    nonce: pending.nonce,
    now,
    keys: deps.keys,
  });
  return {
    v: 1,
    sub: claims.sub,
    sid: optionalString(claims.sid),
    name: optionalString(claims.name),
    email: optionalString(claims.email),
    org: access.org,
    accessToken: access.accessToken,
    refreshToken,
    idToken,
    accessIssuedAt: access.accessIssuedAt,
    accessExpiresAt: access.accessExpiresAt,
    signedInAt: now,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Renewal (ID-37, ID-38, FRESH-1)
// ---------------------------------------------------------------------------------------------------------------

export type RefreshDeps = { fetch: typeof fetch; now: () => number; save: (session: AccountSession) => void };

export function needsRenewal(session: AccountSession, now: number): boolean {
  const life = session.accessExpiresAt - session.accessIssuedAt;
  return now >= session.accessIssuedAt + life * RENEW_FRACTION;
}

/**
 * ID-37: a new access token and a new refresh token. `save` is called as soon as Account answers with the new
 * refresh token, before the access token is looked at, so a failed check never loses the only refresh token that
 * still works; then again with the complete session.
 */
export async function refreshSession(
  config: AccountClientConfig,
  session: AccountSession,
  deps: RefreshDeps,
): Promise<AccountSession> {
  const answer = await tokenRequest(
    config,
    { grant_type: "refresh_token", refresh_token: session.refreshToken },
    deps.fetch,
    true,
  );
  const newRefresh = answer.refresh_token;
  if (typeof newRefresh !== "string" || !newRefresh) throw new AccountUnavailableError();
  const rotated: AccountSession = { ...session, refreshToken: newRefresh };
  deps.save(rotated);
  const access = accessFrom(answer, deps.now());
  const renewed: AccountSession = {
    ...rotated,
    accessToken: access.accessToken,
    accessIssuedAt: access.accessIssuedAt,
    accessExpiresAt: access.accessExpiresAt,
    org: access.org ?? session.org,
  };
  deps.save(renewed);
  return renewed;
}

export type RefreshCoordinator = {
  refresh(config: AccountClientConfig, session: AccountSession, deps: RefreshDeps): Promise<AccountSession>;
};

const tokenKey = (refreshToken: string) => createHash("sha256").update(refreshToken).digest("hex");

/**
 * One refresh at a time per session within this process (see the module comment for the limit across
 * processes). Concurrent requests with the same refresh token share one call; a request that arrives within 30 s
 * with the old token gets the stored answer instead of showing the old token to Account again.
 */
export function createRefreshCoordinator(windowSeconds = REFRESH_REUSE_WINDOW_SECONDS, maxEntries = 1000): RefreshCoordinator {
  const inflight = new Map<string, Promise<AccountSession>>();
  const recent = new Map<string, { session: AccountSession; until: number }>();

  const prune = (now: number) => {
    for (const [key, entry] of recent) if (entry.until <= now) recent.delete(key);
    while (recent.size > maxEntries) {
      const oldest = recent.keys().next().value;
      if (oldest === undefined) break;
      recent.delete(oldest);
    }
  };

  return {
    async refresh(config, session, deps) {
      const key = tokenKey(session.refreshToken);
      prune(deps.now());
      const memo = recent.get(key);
      if (memo) {
        deps.save(memo.session);
        return memo.session;
      }
      const running = inflight.get(key);
      if (running) {
        try {
          const renewed = await running;
          deps.save(renewed);
          return renewed;
        } catch (error) {
          const rotated = recent.get(key);
          if (rotated) deps.save(rotated.session);
          throw error;
        }
      }
      let rotated: AccountSession | null = null;
      const call = refreshSession(config, session, {
        fetch: deps.fetch,
        now: deps.now,
        save: (next) => {
          rotated = next;
          deps.save(next);
        },
      })
        .then((renewed) => {
          recent.set(key, { session: renewed, until: deps.now() + windowSeconds });
          return renewed;
        })
        .catch((error: unknown) => {
          // The refresh token was rotated but the answer was unusable: later requests use the new one.
          if (rotated) recent.set(key, { session: rotated, until: deps.now() + windowSeconds });
          throw error;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, call);
      return call;
    },
  };
}

export type FreshSession = {
  outcome: "none" | "ok" | "renewed" | "signed_out" | "unavailable";
  session: AccountSession | null;
  /** A new sealed cookie value to set; null: clear the cookie; undefined: leave it as it is. */
  setCookie?: string | null;
};

/**
 * The session from its sealed cookie, renewed when four fifths of the access token's life has passed.
 * `signed_out`: no usable sign-in (clear the cookie, sign in again). `unavailable`: Account could not be reached;
 * the session is kept (with the new refresh token if Account rotated it before failing) to try again later.
 */
export async function ensureFreshSession(
  config: AccountClientConfig,
  sealed: string | null | undefined,
  deps: { fetch: typeof fetch; now: () => number; coordinator: RefreshCoordinator },
): Promise<FreshSession> {
  if (!sealed) return { outcome: "none", session: null };
  const session = unsealSession(config, sealed);
  if (!session) return { outcome: "signed_out", session: null, setCookie: null };
  const now = deps.now();
  if (now >= session.signedInAt + SIGN_IN_MAX_LIFETIME_SECONDS) {
    return { outcome: "signed_out", session: null, setCookie: null };
  }
  if (!needsRenewal(session, now)) return { outcome: "ok", session };
  const saved: { value: AccountSession | null } = { value: null };
  try {
    const renewed = await deps.coordinator.refresh(config, session, {
      fetch: deps.fetch,
      now: deps.now,
      save: (next) => {
        saved.value = next;
      },
    });
    return { outcome: "renewed", session: renewed, setCookie: sealSession(config, renewed) };
  } catch (error) {
    if (error instanceof SignInError) return { outcome: "signed_out", session: null, setCookie: null };
    const kept = saved.value;
    return kept
      ? { outcome: "unavailable", session: kept, setCookie: sealSession(config, kept) }
      : { outcome: "unavailable", session };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sign-out (identity.md 5.3, 11.1)
// ---------------------------------------------------------------------------------------------------------------

/** End this client's refresh tokens of that sign-in. Never throws: the local session is gone either way. */
export async function revokeRefreshToken(config: AccountClientConfig, refreshToken: string, fetchFn: typeof fetch): Promise<void> {
  try {
    await fetchFn(`${config.issuer}/oauth/revoke`, {
      method: "POST",
      headers: { Authorization: basicAuth(config), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    // Account ends the token at its own limits
  }
}

/** Where the browser goes after the local session is deleted. `client_id` is always sent (RP-initiated logout). */
export function endSessionUrl(config: AccountClientConfig, idToken: string | null, state: string): string {
  const params = new URLSearchParams();
  if (idToken) params.set("id_token_hint", idToken);
  params.set("client_id", config.clientId);
  params.set("post_logout_redirect_uri", config.signedOutUri);
  params.set("state", state);
  return `${config.issuer}/oauth/end-session?${params.toString()}`;
}

export const randomState = () => b64u(randomBytes(16));

// ---------------------------------------------------------------------------------------------------------------
// Process-wide defaults for the route handlers
// ---------------------------------------------------------------------------------------------------------------

export const nowSeconds = () => Math.floor(Date.now() / 1000);

const keySets = new Map<string, KeySetCache>();
const defaultCoordinator = createRefreshCoordinator();

export function keySetFor(issuer: string): KeySetCache {
  let cache = keySets.get(issuer);
  if (!cache) {
    cache = createKeySetCache({ issuer, fetch: (...args) => fetch(...args), now: nowSeconds });
    keySets.set(issuer, cache);
  }
  return cache;
}

export function signInDeps(config: AccountClientConfig): SignInDeps {
  return { fetch: (...args) => fetch(...args), now: nowSeconds, keys: keySetFor(config.issuer) };
}

export function freshSessionDeps() {
  return { fetch: ((...args) => fetch(...args)) as typeof fetch, now: nowSeconds, coordinator: defaultCoordinator };
}
