import assert from "node:assert/strict";
import test from "node:test";
import { checkWorkerCompatibility } from "../scripts/check-worker-compatibility.mjs";
import { LOG_SCHEMA_VERSION, validateLogInput } from "../lib/log-schema.mjs";
import worker from "../workers/oauth.mjs";
import { BUILD_COMMIT } from "../workers/build-commit.mjs";

const compatibleCapabilities = (extra = {}) => ({ logSchema: { min: 1, max: LOG_SCHEMA_VERSION }, ...extra });

test("Worker publishes the supported log schema before authentication", async () => {
  const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/capabilities"), {}, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { logSchema: { min: 1, max: LOG_SCHEMA_VERSION }, buildCommit: BUILD_COMMIT });
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
      ? compatibleCapabilities()
      : null), { headers: { "Content-Type": "application/json" } });
  };
  const result = await checkWorkerCompatibility({ fetchImpl });
  assert.deepEqual(paths, ["/api/capabilities", "/api/session"]);
  assert.equal(result.commitChecked, false);
});

test("Pages gate blocks a Worker that cannot accept the site schema", async () => {
  for (const status of [404, 200]) {
    const fetchImpl = async () => status === 404
      ? new Response(null, { status })
      : Response.json({ logSchema: { min: 1, max: LOG_SCHEMA_VERSION - 1 } });
    await assert.rejects(checkWorkerCompatibility({ fetchImpl }), /capabilities returned|Deploy the compatible Worker first/);
  }
});

test("a Worker left at an older build is accepted when the push did not change Worker inputs", async () => {
  // Worker 没改就应当继续服务：只有兼容性重要，提交号不必等于本次推送。
  const fetchImpl = async (url) => Response.json(url.pathname === "/api/capabilities"
    ? compatibleCapabilities({ buildCommit: "b".repeat(40) })
    : null);
  const result = await checkWorkerCompatibility({ fetchImpl });
  assert.equal(result.commitChecked, false);
  assert.equal(result.buildCommit, "b".repeat(40));
});

test("Pages waits for the same-commit Worker only when Worker inputs changed", async () => {
  const requireCommit = "a".repeat(40);
  const stale = async (url) => Response.json(url.pathname === "/api/capabilities"
    ? compatibleCapabilities({ buildCommit: "b".repeat(40) })
    : null);
  await assert.rejects(checkWorkerCompatibility({ fetchImpl: stale, requireCommit }), /changed Worker inputs.*waiting for/);

  const current = async (url) => Response.json(url.pathname === "/api/capabilities"
    ? compatibleCapabilities({ buildCommit: requireCommit })
    : null);
  const result = await checkWorkerCompatibility({ fetchImpl: current, requireCommit });
  assert.equal(result.commitChecked, true);
  assert.equal(result.buildCommit, requireCommit);

  const unstamped = async (url) => Response.json(url.pathname === "/api/capabilities"
    ? compatibleCapabilities({ buildCommit: null })
    : null);
  await assert.rejects(checkWorkerCompatibility({ fetchImpl: unstamped, requireCommit }), /unstamped build/);
});

test("identity checks are skipped when no commit is required, even for an unstamped Worker", async () => {
  const fetchImpl = async (url) => Response.json(url.pathname === "/api/capabilities"
    ? compatibleCapabilities()
    : null);
  const result = await checkWorkerCompatibility({ fetchImpl });
  assert.equal(result.commitChecked, false);
  assert.equal(result.buildCommit, null);
});
