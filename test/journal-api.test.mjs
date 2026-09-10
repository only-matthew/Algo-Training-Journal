import assert from "node:assert/strict";
import test from "node:test";

import { apiRequest, loadSession, saveDateLog } from "../lib/journal-api.js";
import worker, { logRoots, seal } from "../workers/oauth.mjs";

test("anonymous session lookup succeeds without relaxing protected endpoints", async () => {
  const env = { SESSION_SECRET: "test-session-secret" };
  const expired = await seal({ login: "only-matthew", member: "廖夏", exp: Date.now() - 1000 }, env.SESSION_SECRET);
  for (const cookie of ["", "__Host-journal_session=invalid", `__Host-journal_session=${expired}`]) {
    const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
      headers: { Origin: "https://train.xialiao.org", Cookie: cookie },
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://train.xialiao.org");
  }
  for (const [pathname, method] of [["/api/logs/date", "GET"], ["/api/logs/date", "PUT"], ["/api/v2/me/profile", "GET"], ["/api/session", "POST"]]) {
    const response = await worker.fetch(new Request(`https://algo-oauth.xialiao.org${pathname}`, { method }), env);
    assert.equal(response.status, 401);
  }
  const forbidden = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
    headers: { Origin: "https://untrusted.example" },
  }), env);
  assert.equal(forbidden.status, 403);
});

test("authenticated session preserves public profile and CSRF without exposing credentials", async () => {
  const env = { SESSION_SECRET: "test-session-secret" };
  const cookie = await seal({ login: "only-matthew", member: "廖夏", avatar_url: "https://avatars.githubusercontent.com/u/1", csrfToken: "test-csrf", token: "private-token", exp: Date.now() + 60000 }, env.SESSION_SECRET);
  const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
    headers: { Cookie: `__Host-journal_session=${cookie}` },
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.login, "only-matthew");
  assert.equal(body.csrfToken, "test-csrf");
  assert.equal(body.token, undefined);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("anonymous session clears a previously loaded CSRF token", async (context) => {
  let signedIn = true;
  let writeHeaders;
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url).endsWith("/api/session")) return Response.json(signedIn ? { login: "only-matthew", csrfToken: "old-token" } : null);
    writeHeaders = options.headers;
    return Response.json({ problems: [] });
  });
  assert.equal((await loadSession()).login, "only-matthew");
  signedIn = false;
  assert.equal(await loadSession(), null);
  await saveDateLog("2026-09-10", []);
  assert.equal(writeHeaders["X-CSRF-Token"], undefined);
});

test("logRoots prefers the current date layout and retains the legacy fallback", () => {
  assert.deepEqual(logRoots("廖夏", "2026-07-31"), [
    "logs/廖夏/2026/07/31",
    "logs/廖夏/2026-07-31",
  ]);
});

test("authenticated writes include credentials and the session CSRF token", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith("/api/session")) {
      return new Response(JSON.stringify({ login: "only-matthew", csrfToken: "csrf-test" }));
    }
    return new Response(JSON.stringify({ problems: [] }));
  });

  await loadSession();
  await saveDateLog("2026-07-31", []);

  assert.equal(requests[1].options.credentials, "include");
  assert.equal(requests[1].options.method, "PUT");
  assert.equal(requests[1].options.headers["X-CSRF-Token"], "csrf-test");
});

test("API errors preserve structured v2 conflict details", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    error: { code: "VERSION_CONFLICT", message: "版本已更新", currentRevision: "sha256:new" },
    requestId: "request-1",
  }), { status: 409, headers: { "Content-Type": "application/json", "Retry-After": "2" } }));

  await assert.rejects(apiRequest("/api/v2/me/plans/2026-09-06"), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.error.code, "VERSION_CONFLICT");
    assert.equal(error.requestId, "request-1");
    assert.equal(error.retryAfter, "2");
    return true;
  });
});
