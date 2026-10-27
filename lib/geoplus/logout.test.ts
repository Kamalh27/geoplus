import assert from "node:assert/strict";
import test from "node:test";

import { getLogoutCookieOptions, resolveSafeNextUrl } from "./logout.ts";

const requestUrl = new URL("https://geoplus.example.com/api/geoplus/auth/logout?next=/foo");

test("resolveSafeNextUrl keeps same-origin relative paths", () => {
  assert.equal(resolveSafeNextUrl("/dashboards/abc?x=1", requestUrl).toString(), "https://geoplus.example.com/dashboards/abc?x=1");
  assert.equal(resolveSafeNextUrl("https://geoplus.example.com/ok", requestUrl).pathname, "/ok");
});

test("resolveSafeNextUrl falls back to / for cross-origin and malformed targets", () => {
  const unsafe = [
    "https://evil.example.org/",
    "//evil.example.org/path",
    "/\\evil.example.org",
    "http://geoplus.example.com/downgrade",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ];
  for (const candidate of unsafe) {
    assert.equal(resolveSafeNextUrl(candidate, requestUrl).toString(), "https://geoplus.example.com/", String(candidate));
  }
});

test("getLogoutCookieOptions derives domain and secure from env", () => {
  assert.deepEqual(getLogoutCookieOptions({ AUTH_COOKIE_DOMAIN: ".spadace.com", NODE_ENV: "production" }), {
    path: "/",
    domain: ".spadace.com",
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  const hostOnly = getLogoutCookieOptions({ AUTH_COOKIE_DOMAIN: "", NODE_ENV: "development" });
  assert.equal("domain" in hostOnly, false);
  assert.equal(hostOnly.secure, false);
  assert.equal(hostOnly.httpOnly, true);
});
