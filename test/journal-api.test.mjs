import assert from "node:assert/strict";
import test from "node:test";

import { apiRequest, loadSession, saveDateLog } from "../lib/journal-api.js";
import { logRoots } from "../workers/oauth.mjs";

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
