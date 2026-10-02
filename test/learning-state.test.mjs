import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLearningState } from "../lib/learning-state.mjs";
import { LOG_SCHEMA_VERSION, metaFromProblems, normalizeMeta, validateLogInput } from "../lib/log-schema.mjs";
import { computeVitalityTimeline } from "../lib/vitality.mjs";

test("legacy mastered is only a self-assessment and does not invent review or outcome", () => {
  assert.deepEqual(normalizeLearningState({ reviewStatus: "mastered" }), {
    masteryStatus: "mastered", isMistake: false, reviewStatus: "none",
    masteryStatusSource: "legacy_review_status",
  });
});

test("mistake, outcome, mastery, and review remain independent", () => {
  const state = normalizeLearningState({ outcome: "independent", isMistake: true, masteryStatus: "mastered", reviewStatus: "todo" });
  assert.deepEqual(state, { outcome: "independent", isMistake: true, masteryStatus: "mastered", masteryStatusSource: "explicit_self_assessment", reviewStatus: "todo" });
  assert.equal(normalizeLearningState({ outcome: "unfinished", isMistake: false }).reviewStatus, "none");
  assert.equal(normalizeLearningState({ isMistake: true }).outcome, undefined);
});

test("legacy mastery migration provenance survives normalization and storage", () => {
  const normalized = normalizeMeta({ problems: [{ id: "legacy-1", name: "A", reviewStatus: "mastered" }] });
  assert.equal(normalized.problems[0].masteryStatusSource, "legacy_review_status");
  const stored = metaFromProblems(normalized.problems);
  assert.equal(normalizeMeta(stored).problems[0].masteryStatusSource, "legacy_review_status");
  assert.equal(normalizeLearningState({ masteryStatus: "mastered" }).masteryStatusSource, "explicit_self_assessment");
});

test("the current schema round-trips independent learning fields", () => {
  const input = validateLogInput({ schemaVersion: LOG_SCHEMA_VERSION, problems: [{ id: "p1", name: "A", outcome: "hinted", isMistake: true, masteryStatus: "learning", reviewStatus: "todo", reviewDue: "2026-09-20" }] });
  const restored = normalizeMeta(metaFromProblems(input.problems));
  assert.equal(restored.schemaVersion, LOG_SCHEMA_VERSION);
  assert.deepEqual(normalizeLearningState(restored.problems[0]), normalizeLearningState(input.problems[0]));
});

test("超纲自评独立于复习安排，兼容历史记录", () => {
  for (const reviewStatus of ["none", "todo", "archived"]) {
    const input = validateLogInput({ schemaVersion: LOG_SCHEMA_VERSION, problems: [{ id: "p1", name: "A", outcome: "unfinished", masteryStatus: "beyond_scope", reviewStatus, ...(reviewStatus === "todo" ? { reviewDue: "2026-10-10" } : {}) }] });
    const restored = normalizeMeta(metaFromProblems(input.problems)).problems[0];
    assert.equal(restored.masteryStatus, "beyond_scope");
    assert.equal(restored.reviewStatus, reviewStatus);
    if (reviewStatus === "todo") assert.equal(restored.reviewDue, "2026-10-10");
  }
  const legacy = normalizeMeta({ schemaVersion: 7, problems: [{ id: "p1", name: "A", masteryStatus: "learning", reviewStatus: "deferred" }] }).problems[0];
  assert.equal(legacy.masteryStatus, "beyond_scope");
  assert.equal(legacy.reviewStatus, "none");
  assert.equal(normalizeLearningState({ reviewStatus: "deferred", reviewDue: "2026-10-10" }).reviewStatus, "todo");
});

test("the current schema rejects invalid mastery, mistake, and review fields", () => {
  const base = { schemaVersion: LOG_SCHEMA_VERSION, problems: [{ id: "p1", name: "A" }] };
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
  for (const masteryStatus of ["unknown", "learning", "mastered", "beyond_scope"]) for (const isMistake of [false, true]) for (const reviewStatus of ["none", "todo", "deferred", "archived"]) {
    assert.deepEqual(projection({ masteryStatus, isMistake, reviewStatus }), baseline);
  }
});
