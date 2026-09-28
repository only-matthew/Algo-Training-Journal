import assert from "node:assert/strict";
import test from "node:test";
import { checkWorkerCompatibility } from "../scripts/check-worker-compatibility.mjs";
import { LOG_SCHEMA_VERSION, validateLogInput } from "../lib/log-schema.mjs";
import worker from "../workers/oauth.mjs";

test("Worker publishes the supported log schema before authentication", async () => {
  const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/capabilities"), {}, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { logSchema: { min: 1, max: LOG_SCHEMA_VERSION } });
});

test("current Worker accepts current and previous site payloads", () => {
  for (const schemaVersion of [LOG_SCHEMA_VERSION, LOG_SCHEMA_VERSION - 1]) {
    assert.equal(validateLogInput({ schemaVersion, problems: [{ id: "p1", name: "A" }] }).schemaVersion, LOG_SCHEMA_VERSION);
  }
});

test("Pages gate accepts a compatible Worker and probes the session route", async () => {
  const paths = [];
  const fetchImpl = async (url) => {
    paths.push(url.pathname);
    return new Response(JSON.stringify(url.pathname === "/api/capabilities"
      ? { logSchema: { min: 1, max: LOG_SCHEMA_VERSION } }
      : null), { headers: { "Content-Type": "application/json" } });
  };
  await checkWorkerCompatibility({ fetchImpl });
  assert.deepEqual(paths, ["/api/capabilities", "/api/session"]);
});

test("Pages gate blocks an older or unidentified Worker", async () => {
  for (const status of [404, 200]) {
    const fetchImpl = async () => status === 404
      ? new Response(null, { status })
      : Response.json({ logSchema: { min: 1, max: LOG_SCHEMA_VERSION - 1 } });
    await assert.rejects(checkWorkerCompatibility({ fetchImpl }), /capabilities returned|Deploy the compatible Worker first/);
  }
});
