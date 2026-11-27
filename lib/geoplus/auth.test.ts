import assert from "node:assert/strict";
import test from "node:test";

import {
  authErrorPath,
  getLoginUrl,
  parseAuthErrorCode,
  resolveLogoutTarget,
  sanitizeNextPath,
} from "./auth.ts";

test("sanitizeNextPath keeps local paths with query and hash", () => {
  assert.equal(sanitizeNextPath("/"), "/");
  assert.equal(sanitizeNextPath("/?id=abc&project_uid=p1"), "/?id=abc&project_uid=p1");
  assert.equal(sanitizeNextPath("/geoplus/docs#maps"), "/geoplus/docs#maps");
});

test("sanitizeNextPath refuses other origins, tricks and sign-in loops", () => {
  const unsafe = [
    "https://evil.example/",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "relative/path",
    "/auth/callback?code=x",
    "/auth/signed-out",
    "/api/geoplus/auth/login",
    "/ok\nSet-Cookie: x",
    "/" + "a".repeat(3000),
    "",
    null,
    undefined,
    42,
  ];
  for (const value of unsafe) assert.equal(sanitizeNextPath(value), "/", String(value));
});

test("getLoginUrl builds the same-origin login start", () => {
  assert.equal(getLoginUrl("/?id=abc"), "/api/geoplus/auth/login?next=%2F%3Fid%3Dabc");
  assert.equal(getLoginUrl("https://evil.example"), "/api/geoplus/auth/login?next=%2F");
  const org = "0193a6ee-1c00-7f4a-a2b9-6d5e4c3b2a19";
  assert.equal(new URLSearchParams(getLoginUrl("/", org).split("?")[1]).get("organisation"), org);
  assert.equal(new URLSearchParams(getLoginUrl("/", "nope").split("?")[1]).get("organisation"), null);
});

test("resolveLogoutTarget accepts Account's end-session address or a local path only", () => {
  const end = "http://localhost:8050/oauth/end-session?client_id=geoplus-web-dev";
  assert.equal(resolveLogoutTarget({ redirect_to: end }), end);
  assert.equal(resolveLogoutTarget({ redirect_to: "/auth/signed-out" }), "/auth/signed-out");
  for (const body of [{ redirect_to: "javascript:alert(1)" }, { redirect_to: "//evil" }, { redirect_to: 3 }, null, [], "x"]) {
    assert.equal(resolveLogoutTarget(body), "/auth/signed-out");
  }
});

test("auth error codes are a fixed list", () => {
  assert.equal(parseAuthErrorCode("account_unavailable"), "account_unavailable");
  assert.equal(parseAuthErrorCode("<script>"), "sign_in_failed");
  assert.equal(authErrorPath("not_configured"), "/auth/error?code=not_configured");
});
