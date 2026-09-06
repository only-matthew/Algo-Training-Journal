import test from "node:test";
import assert from "node:assert/strict";
import { trainingHistory } from "../lib/training-history.mjs";

test("historical training belongs to the signed-in member and never invents independent evidence", () => {
  const logs = [
    { member: "甲", date: "2026-09-01", problemId: "a", platform: "洛谷", problemNumber: "P1001", reviewStatus: "todo", reviewDue: "2026-09-03" },
    { member: "甲", date: "2026-09-02", problemId: "b", platform: "洛谷", problemNumber: "P1001", reviewStatus: "mastered" },
    { member: "乙", date: "2026-09-05", problemId: "c", platform: "洛谷", problemNumber: "P1002" },
  ];
  const history = trainingHistory(logs, "甲", "2026-09-06");
  assert.equal(history.records.length, 2);
  assert.equal(history.evidence.distinctProblems, 1);
  assert.equal(history.evidence.independentProblems, 0);
  assert.equal(history.evidence.lastPracticedOn, "2026-09-02");
  assert.equal(history.reviews.length, 0);
  assert.equal(trainingHistory(logs, null, "2026-09-06").records.length, 0);
});

test("unidentified old problems stay separate and overdue reviews link to the original record", () => {
  const logs = ["a", "b"].map((problemId) => ({ member: "甲", date: "2026-09-01", problemId, problem: "同名题", reviewStatus: "todo", reviewDue: "2026-09-03" }));
  const history = trainingHistory(logs, "甲", "2026-09-06");
  assert.equal(history.evidence.distinctProblems, 2);
  assert.equal(history.reviews.length, 2);
  assert.equal(history.reviews[0].href, "/problem/%E7%94%B2/2026-09-01/a/");
  assert.equal(trainingHistory(logs, "甲", "2026-09-02").reviews.length, 0);
});
