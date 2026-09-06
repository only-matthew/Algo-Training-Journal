import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES, recommendV1 } from "../lib/recommendations.mjs";

const problem = (subjectKey, name = subjectKey) => ({ subjectKey, problem: { name } });

const curriculum = {
  phases: [{ id: "base", nodes: ["basics", "advanced", "later"] }],
  nodes: [
    { id: "basics", prerequisites: [], problems: [problem("p|a"), problem("p|b")] },
    { id: "advanced", prerequisites: ["basics"], problems: [problem("p|c")] },
    { id: "later", prerequisites: ["advanced"], problems: [problem("p|d")] },
  ],
};

test("recommend-v1 follows priority, deduplicates, and preserves stable order", () => {
  const input = {
    today: "2026-09-06",
    profile: { dailyItemLimit: 10, dailyBudgetMinutes: 240, focusNodeIds: ["advanced", "basics"] },
    plan: { items: [{ subjectKey: "p|b", status: "queued" }] },
    exclude: ["p|c"],
    reviews: [
      { state: "scheduled", dueOn: "2026-09-06", ...problem("p|review-z"), recordRef: { id: "z" } },
      { state: "scheduled", dueOn: "2026-09-05", ...problem("p|review-a"), recordRef: { id: "a" } },
    ],
    evidence: {
      historicalSubjectKeys: ["p|a"],
      upsolvePending: [problem("p|upsolve")],
      selfAssessments: { basics: "comfortable", advanced: "comfortable" },
    },
    curriculum,
  };
  const result = recommendV1(input);
  assert.equal(result.algorithmVersion, "recommend-v1");
  assert.deepEqual(result.candidates.map((item) => item.subjectKey), ["p|review-a", "p|review-z", "p|upsolve", "p|d"]);
  assert.equal(result.candidates[0].kind, "review");
  assert.deepEqual(result.candidates[0].reasonCodes, [REASON_CODES.REVIEW_DUE]);
  assert.equal(result.candidates[0].dueOn, "2026-09-05");
  assert.deepEqual(result.candidates[0].recordRef, { id: "a" });
  assert.deepEqual(result.candidates[3].reasonCodes, [REASON_CODES.NEXT_NODE, REASON_CODES.PREREQUISITE_SELF_ASSESSED]);
  assert.equal(result.candidates[3].nodeId, "later");
  assert.deepEqual(result.candidates[3].prerequisiteNodeIds, ["advanced"]);
  assert.deepEqual(recommendV1(input), result);
});

test("recommend-v1 admits a focus node without prerequisites but gates normal route nodes", () => {
  const result = recommendV1({
    today: "2026-09-06",
    profile: { dailyItemLimit: 3, dailyBudgetMinutes: 60, focusNodeIds: ["advanced"] },
    plan: { items: [] }, evidence: {}, reviews: [], curriculum,
  });
  assert.deepEqual(result.candidates.map((item) => item.subjectKey), ["p|c", "p|a", "p|b"]);
  assert.equal(result.candidates[0].reasonCodes[0], REASON_CODES.FOCUS_NODE);
});

test("recommend-v1 selects only the first accessible route node without focus", () => {
  const result = recommendV1({
    today: "2026-09-06", profile: { dailyItemLimit: 5, dailyBudgetMinutes: 200 }, plan: { items: [] },
    evidence: { independentSubjectKeys: ["p|a"] }, reviews: [], curriculum,
  });
  assert.deepEqual(result.candidates.map((item) => item.subjectKey), ["p|a", "p|b"]);
  assert.equal(result.candidates[0].reasonCodes[0], REASON_CODES.NEXT_NODE);
});

test("recommend-v1 applies item and budget caps, allowing one item over a small budget", () => {
  const result = recommendV1({
    today: "2026-09-06", profile: { dailyItemLimit: 3, dailyBudgetMinutes: 15 }, plan: { items: [] },
    evidence: {}, reviews: [{ state: "scheduled", dueOn: "2026-09-06", ...problem("p|review") }], curriculum,
  });
  assert.deepEqual(result.candidates.map((item) => item.subjectKey), ["p|review"]);
  assert.equal(result.candidates[0].plannedMinutes, 20);
});

test("recommend-v1 leaves no room when ten effective plan items already exist", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ subjectKey: `p|planned-${index}`, status: "queued" }));
  const result = recommendV1({
    today: "2026-09-06", profile: { dailyItemLimit: 3, dailyBudgetMinutes: 60 }, plan: { items },
    evidence: {}, reviews: [{ state: "scheduled", dueOn: "2026-09-06", ...problem("p|review") }], curriculum,
  });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.reasonCodes, [REASON_CODES.NO_CANDIDATES]);
});

test("recommend-v1 never emits historical normal problems and reports an empty reason", () => {
  const result = recommendV1({
    today: "2026-09-06", profile: { dailyItemLimit: 3, dailyBudgetMinutes: 60 }, plan: { items: [] },
    evidence: { historicalSubjectKeys: ["p|a", "p|b"] }, reviews: [], curriculum,
  });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.reasonCodes, [REASON_CODES.NO_CANDIDATES]);
});
