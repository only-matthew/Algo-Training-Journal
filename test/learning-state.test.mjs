import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLearningState } from "../lib/learning-state.mjs";
import { metaFromProblems, normalizeMeta, validateLogInput } from "../lib/log-schema.mjs";
import { computeVitalityTimeline } from "../lib/vitality.mjs";

test("legacy mastered is only a self-assessment and does not invent review or outcome", () => {
  assert.deepEqual(normalizeLearningState({ reviewStatus: "mastered" }), {
    masteryStatus: "mastered", isMistake: false, reviewStatus: "none",
  });
});

test("mistake, outcome, mastery, and review remain independent", () => {
  const state = normalizeLearningState({ outcome: "independent", isMistake: true, masteryStatus: "mastered", reviewStatus: "todo" });
  assert.deepEqual(state, { outcome: "independent", isMistake: true, masteryStatus: "mastered", reviewStatus: "todo" });
  assert.equal(normalizeLearningState({ outcome: "unfinished", isMistake: false }).reviewStatus, "none");
  assert.equal(normalizeLearningState({ isMistake: true }).outcome, undefined);
});

test("v5 round-trip preserves independent learning fields", () => {
  const input = validateLogInput({ schemaVersion: 5, problems: [{ id: "p1", name: "A", outcome: "hinted", isMistake: true, masteryStatus: "learning", reviewStatus: "todo", reviewDue: "2026-09-20" }] });
  const restored = normalizeMeta(metaFromProblems(input.problems));
  assert.equal(restored.schemaVersion, 5);
  assert.deepEqual(normalizeLearningState(restored.problems[0]), normalizeLearningState(input.problems[0]));
});

test("v5 rejects invalid mastery, mistake, and review fields", () => {
  const base = { schemaVersion: 5, problems: [{ id: "p1", name: "A" }] };
  assert.throws(() => validateLogInput({ ...base, problems: [{ ...base.problems[0], masteryStatus: "maybe" }] }), /掌握自评/);
  assert.throws(() => validateLogInput({ ...base, problems: [{ ...base.problems[0], isMistake: "yes" }] }), /失误标记/);
  assert.throws(() => validateLogInput({ ...base, problems: [{ ...base.problems[0], reviewStatus: "mastered" }] }), /复习状态/);
});

test("timeline vitality and same-subject completion delta ignore mastery, mistake, and review", () => {
  const source = [
    { member: "甲", date: "2026-09-01", problemId: "first", platform: "Codeforces", problemNumber: "1A", rating: 1600, tags: ["DP"] }, // missing outcome uses unknown credit
    { member: "甲", date: "2026-09-02", problemId: "second", platform: "Codeforces", problemNumber: "1A", rating: 1600, tags: ["DP"], outcome: "independent" },
  ];
  const projection = (state) => computeVitalityTimeline(source.map((record) => ({ ...record, ...state })), (from, to) => from === to ? 0 : 1)
    .map(({ vitality, vitalityStatus, outcome, subjectKey, rating, theta, confidence }) => ({ vitality, vitalityStatus, outcome, subjectKey, rating, theta, confidence }));
  const baseline = projection({ masteryStatus: "unknown", isMistake: false, reviewStatus: "none" });
  assert.equal(baseline[0].outcome, "unknown");
  assert.equal(baseline[1].vitalityStatus, "completed_delta");
  for (const masteryStatus of ["unknown", "learning", "mastered"]) for (const isMistake of [false, true]) for (const reviewStatus of ["none", "todo", "archived"]) {
    assert.deepEqual(projection({ masteryStatus, isMistake, reviewStatus }), baseline);
  }
});
