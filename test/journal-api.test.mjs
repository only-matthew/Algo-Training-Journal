import assert from "node:assert/strict";
import test from "node:test";

import { loadSession, saveDateLog } from "../lib/journal-api.js";
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