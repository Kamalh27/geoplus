import assert from "node:assert/strict";
import test from "node:test";

import {
  authErrorPath,
  getLoginUrl,
  parseAuthErrorCode,
  resolveLogoutTarget,
  resolveNextUrl,
  sanitizeNextPath,
} from "./auth.ts";

// Dot segments collapse during URL parsing: each of these resolves to the path `//evil.com`, which a browser
// then reads as another host. Encoded dots and slashes are included.
const DOT_SEGMENT_REDIRECTS = [
  "/.//evil.com",
  "/..//evil.com",
  "/%2e//evil.com",
  "/%2E//evil.com",
  "/%2e%2e//evil.com",
  "/%2E%2E//evil.com",
  "/a/..//evil.com",
  "/a/%2e%2e//evil.com",
  "/./\\evil.com",
  "/.//evil.com/path?x=1",
  "/%2e/%2fevil.com",
];

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

test("sanitizeNextPath refuses paths that collapse to //host (open redirect)", () => {
  for (const value of DOT_SEGMENT_REDIRECTS) {
    const safe = sanitizeNextPath(value);
    assert.ok(!safe.startsWith("//") && !safe.includes("\\"), `${value} -> ${safe}`);
    assert.equal(new URL(safe, "http://localhost:3001").origin, "http://localhost:3001", value);
  }
  assert.equal(sanitizeNextPath("/a/../b?c=1"), "/b?c=1");
});

test("resolveNextUrl stays on the given origin whatever next is", () => {
  const base = new URL("http://localhost:3001/auth/callback");
  assert.equal(resolveNextUrl("/?id=abc", base).toString(), "http://localhost:3001/?id=abc");
  for (const value of [...DOT_SEGMENT_REDIRECTS, "//evil.com", "https://evil.com/", "/\\evil.com", null, ""]) {
    const target = resolveNextUrl(value, base);
    assert.equal(target.origin, "http://localhost:3001", String(value));
  }
  assert.equal(resolveNextUrl("/.//evil.com", base).toString(), "http://localhost:3001/");
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
