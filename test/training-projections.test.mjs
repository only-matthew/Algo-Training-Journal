import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceV1, foldTrainingEvents, projectReviewSchedule } from "../lib/training-projections.mjs";

const subjectKey = "problem:Codeforces|123A";
const attempt = (id, sequence, performedOn, outcome, mode = "review") => ({
  id, type: "attempt.recorded", memberId: "m1", subjectKey, sequence, performedOn, outcome, mode,
  recordRef: { memberId: "m1", date: performedOn, recordId: id },
});

test("folds corrections and voids without changing an attempt's ordering sequence", () => {
  const events = [
    attempt("a1", 1, "2026-09-01", "hinted"),
    { id: "c1", type: "attempt.corrected", targetAttemptId: "a1", sequence: 3, patch: { outcome: "independent", performedOn: "2026-09-02" } },
    attempt("a2", 2, "2026-09-03", "unfinished"),
    { id: "v1", type: "attempt.voided", targetAttemptId: "a2", sequence: 4 },
  ];
  assert.deepEqual(foldTrainingEvents(events).map(({ id, outcome, performedOn, originalSequence }) => ({ id, outcome, performedOn, originalSequence })), [
    { id: "a1", outcome: "independent", performedOn: "2026-09-02", originalSequence: 1 },
  ]);
});

test("uses the last known same-day review result and calculates review-v1 intervals", () => {
  const review = projectReviewSchedule({ events: [
    attempt("a1", 1, "2026-09-01", "independent"),
    attempt("a2", 2, "2026-09-01", "unfinished"),
    attempt("a3", 3, "2026-09-01", "unknown"),
    attempt("a4", 4, "2026-09-04", "independent"),
  ] });
  assert.equal(review.successStreak, 1);
  assert.equal(review.lastAttemptId, "a4");
  assert.equal(review.lastReviewedOn, "2026-09-04");
  assert.equal(review.dueOn, "2026-09-07");
});

test("applies a subject's correction even though correction events have no subjectKey", () => {
  const review = projectReviewSchedule({ events: [
    attempt("a1", 1, "2026-09-01", "hinted"),
    { id: "c1", type: "attempt.corrected", memberId: "m1", targetAttemptId: "a1", sequence: 2, patch: { outcome: "independent" } },
  ] });
  assert.equal(review.successStreak, 1);
  assert.equal(review.dueOn, "2026-09-04");
});

test("newer explicit review actions override automatic scheduling, while old ones do not", () => {
  const events = [
    { id: "schedule", type: "review.deferred", memberId: "m1", subjectKey, sequence: 1, dueOn: "2026-09-30" },
    attempt("a1", 2, "2026-09-05", "independent"),
  ];
  assert.equal(projectReviewSchedule({ events }).dueOn, "2026-09-08");
  events.push({ id: "pause", type: "review.paused", memberId: "m1", subjectKey, sequence: 3 });
  const paused = projectReviewSchedule({ events });
  assert.equal(paused.state, "paused");
  assert.equal(paused.dueOn, null);
});

test("falls back to the earliest legacy due date when no new review event exists", () => {
  const review = projectReviewSchedule({ legacyReviews: [
    { reviewStatus: "todo", reviewDue: "2026-09-12" },
    { reviewStatus: "todo", reviewDue: "2026-09-09" },
  ] });
  assert.equal(review.source, "legacy");
  assert.equal(review.dueOn, "2026-09-09");
});

test("evidence-v1 counts subject evidence, overdue reviews, and recency without a mastery score", () => {
  const attempts = foldTrainingEvents([
    attempt("a1", 1, "2026-05-01", "hinted", "practice"),
    attempt("a2", 2, "2026-05-03", "independent", "practice"),
    { ...attempt("a3", 3, "2026-05-04", "independent", "practice"), subjectKey: "problem:Codeforces|456B" },
  ]);
  const evidence = buildEvidenceV1({
    attempts,
    legacyRecords: [{ subjectKey: "problem:Codeforces|789C", date: "2026-04-01", recordRef: { recordId: "old" } }],
    reviews: [{ subjectKey, state: "scheduled", dueOn: "2026-09-01" }],
    subjectKeys: [subjectKey, "problem:Codeforces|789C"],
    selfAssessment: { level: "learning" },
    today: "2026-09-05",
  });
  assert.deepEqual(evidence, {
    distinctProblems: 2, attempts: 2, independentProblems: 1, assistedProblems: 0, legacyUnknownRecords: 1,
    dueReviews: 1, lastPracticedOn: "2026-05-03", selfAssessment: { level: "learning" }, state: "review_due",
    reasons: ["REVIEW_DUE", "RECENT_EVIDENCE_INSUFFICIENT"],
    recordRefs: [{ memberId: "m1", date: "2026-05-01", recordId: "a1" }, { memberId: "m1", date: "2026-05-03", recordId: "a2" }, { recordId: "old" }],
  });
});
