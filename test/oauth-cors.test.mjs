import assert from "node:assert/strict";
import test from "node:test";

import worker from "../workers/oauth.mjs";

test("review PATCH preflight permits the site origin and required headers", async () => {
  const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/v2/me/logs/dates/2026-09-28/records/p1", {
    method: "OPTIONS",
    headers: {
      Origin: "https://train.xialiao.org",
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "content-type,x-csrf-token",
    },
  }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://train.xialiao.org");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.ok(response.headers.get("Access-Control-Allow-Methods").split(",").includes("PATCH"));
  assert.ok(response.headers.get("Access-Control-Allow-Headers").toLowerCase().includes("x-csrf-token"));
});
