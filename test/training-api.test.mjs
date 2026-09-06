import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../lib/journal-api.js";
import { TrainingApiError, createTrainingApi } from "../lib/training-api.mjs";

const ID = "0f7674cf-7366-4c0b-9df4-8b548c537385";

function harness() {
  const calls = [];
  const api = createTrainingApi({
    createId: () => ID,
    request: async (path, options) => {
      calls.push({ path, options });
      return { data: {}, revision: "sha256:next" };
    },
  });
  return { api, calls };
}

test("reads profile, workbench, recommendations, plans, attempts, and reviews without mutation headers", async () => {
  const { api, calls } = harness();
  const signal = AbortSignal.abort();
  await api.getProfile({ signal });
  await api.getWorkbench({ date: "2026-09-06" });
  await api.getRecommendations({ date: "2026-09-06", exclude: ["codeforces:1a", "atcoder:abc_a"] });
  await api.getPlan("2026-09-06");
  await api.getAttempts({ subjectKey: "codeforces:1a", cursor: "snapshot", limit: 50 });
  await api.getReviews();

  assert.equal(calls[0].path, "/api/v2/me/profile");
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[1].path, "/api/v2/me/workbench?date=2026-09-06");
  assert.equal(calls[2].path, "/api/v2/me/recommendations?date=2026-09-06&exclude=codeforces%3A1a&exclude=atcoder%3Aabc_a");
  assert.equal(calls[3].path, "/api/v2/me/plans/2026-09-06");
  assert.equal(calls[4].path, "/api/v2/me/attempts?subjectKey=codeforces%3A1a&cursor=snapshot&limit=50");
  assert.equal(calls[5].path, "/api/v2/me/reviews");
  assert.deepEqual(calls[0].options.headers, undefined);
});

test("mutations use a UUID idempotency key and the required conditional header", async () => {
  const { api, calls } = harness();
  await api.putProfile({ focusNodeIds: [] }, { revision: null });
  await api.putPlan("2026-09-06", { items: [] }, { revision: "sha256:plan" });
  await api.patchRecord("2026-09-06", "record id", { name: "A" }, { revision: "sha256:record" });
  await api.createAttempt({ recordRef: { date: "2026-09-06", id: "r" }, preconditions: { "record:2026-09-06:r": "sha256:record" } });

  assert.deepEqual(calls[0].options.headers, { "If-None-Match": "*", "Idempotency-Key": ID });
  assert.deepEqual(calls[1].options.headers, { "If-Match": "\"sha256:plan\"", "Idempotency-Key": ID });
  assert.equal(calls[2].path, "/api/v2/me/logs/dates/2026-09-06/records/record%20id");
  assert.deepEqual(calls[2].options.headers, { "If-Match": "\"sha256:record\"", "Idempotency-Key": ID });
  assert.equal(calls[3].options.headers["Idempotency-Key"], ID);
  assert.deepEqual(JSON.parse(calls[3].options.body).preconditions, { "record:2026-09-06:r": "sha256:record" });
});

test("exposes commands for records, attempts, reviews, plans, and assessments", async () => {
  const { api, calls } = harness();
  const opts = { revision: "sha256:target" };
  await api.createRecord({ date: "2026-09-06", problem: {}, preconditions: { "date:2026-09-06": null } });
  await api.correctAttempt("attempt", { outcome: "hinted" }, opts);
  await api.voidAttempt("attempt", "duplicate", opts);
  await api.reviewAction({ subjectKey: "codeforces:1a", action: "pause", preconditions: {} });
  await api.planAction({ date: "2026-09-06", itemId: "item", action: "start", preconditions: {} });
  await api.linkPlanAttempt({ date: "2026-09-06", itemId: "item", attemptId: "attempt", preconditions: {} });
  await api.putAssessment("dp", { level: "comfortable" }, { revision: null });

  assert.deepEqual(calls.map(({ path, options }) => [options.method, path]), [
    ["POST", "/api/v2/me/records"], ["POST", "/api/v2/me/attempts/attempt/corrections"],
    ["POST", "/api/v2/me/attempts/attempt/void"], ["POST", "/api/v2/me/review-actions"],
    ["POST", "/api/v2/me/plan-actions"], ["POST", "/api/v2/me/plan-links"], ["PUT", "/api/v2/me/assessments/dp"],
  ]);
  assert.equal(calls.every(({ options }) => options.headers["Idempotency-Key"] === ID), true);
});

test("turns ApiError details into structured TrainingApiError and preserves cancellation", async () => {
  const api = createTrainingApi({ request: async () => {
    const error = new ApiError("版本冲突", 409);
    error.error = { code: "VERSION_CONFLICT", currentRevision: "sha256:new", fieldErrors: { title: "stale" } };
    throw error;
  } });
  await assert.rejects(() => api.putPlan("2026-09-06", { items: [] }, { revision: "sha256:old", idempotencyKey: ID }), (error) => {
    assert.equal(error instanceof TrainingApiError, true);
    assert.equal(error.status, 409);
    assert.equal(error.code, "VERSION_CONFLICT");
    assert.equal(error.currentRevision, "sha256:new");
    return true;
  });

  const cancelled = createTrainingApi({ request: async () => { throw new DOMException("cancelled", "AbortError"); } });
  await assert.rejects(() => cancelled.getReviews({ signal: AbortSignal.abort() }), (error) => error.name === "TrainingApiError" && error.code === "REQUEST_FAILED" && error.cause.name === "AbortError");
});

test("rejects invalid client-side API usage before it sends a request", async () => {
  const { api, calls } = harness();
  assert.throws(() => api.putDateLog("2026-09-06", [], {}), /revision/);
  assert.throws(() => api.createRecord({ memberId: "someone" }), /memberId/);
  assert.throws(() => api.createAttempt({ recordRef: { date: "2026-09-06", id: "r" } }), /preconditions/);
  assert.throws(() => api.getRecommendations({ exclude: Array(51).fill("x") }), /50/);
  assert.equal(calls.length, 0);
});
