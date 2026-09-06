import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_DEFAULTS,
  TRAINING_LIMITS,
  codePointLength,
  isDateString,
  isUuidV4,
  utf8Bytes,
  validateAttemptEvent,
  validatePlan,
  validateProfile,
  validateReview,
  validateSelfAssessment,
} from "../lib/training-schema.mjs";

const IDS = Object.freeze({
  item: "4fd06885-a6ed-43b4-9ba6-ec8875638cdf",
  attempt: "0f7674cf-7366-4c0b-9df4-8b548c537385",
  event: "5ca1a170-b129-4df2-8f8d-c0341a213b34",
});
const updatedAt = "2026-09-05T02:00:00.000Z";
const problem = { name: "示例题", platform: "Codeforces", problemNumber: "123A", tags: ["DP"] };
const recordRef = { memberId: "member-example", date: "2026-09-05", recordId: "existing-record-id" };

test("基础日期、UUID 与 Unicode/UTF-8 度量符合规范", () => {
  assert.equal(isDateString("2026-02-28"), true);
  assert.equal(isDateString("2026-02-30"), false);
  assert.equal(isUuidV4(IDS.item), true);
  assert.equal(isUuidV4("4fd06885-a6ed-53b4-9ba6-ec8875638cdf"), false);
  assert.equal(codePointLength("a😀"), 2);
  assert.equal(utf8Bytes("汉"), 3);
});

test("Profile 严格校验服务端字段并保留省略的默认项", () => {
  const profile = validateProfile({
    schemaVersion: 1, memberId: "member-example", updatedAt,
    focusNodeIds: ["dp"], dailyBudgetMinutes: 90, dailyItemLimit: 4, cfHandle: "tourist", goalNote: "补图论",
  });
  assert.equal(profile.dailyBudgetMinutes, 90);
  assert.deepEqual(PROFILE_DEFAULTS, { dailyBudgetMinutes: 60, dailyItemLimit: 3 });
  assert.throws(() => validateProfile({ schemaVersion: 1, memberId: "Bad ID", updatedAt }), /memberId/);
  assert.throws(() => validateProfile({ schemaVersion: 1, memberId: "member-example", updatedAt, extra: true }), /未知字段/);
});

test("Plan 限制项目数量、UUID、活动 subjectKey 和推荐原因", () => {
  const plan = validatePlan({
    schemaVersion: 1, memberId: "member-example", date: "2026-09-06", updatedAt,
    algorithmVersion: "recommend-v1", evidenceSnapshot: { at: updatedAt },
    items: [{ id: IDS.item, subjectKey: "problem:Codeforces|123A", problem, kind: "review", status: "queued", plannedMinutes: 20, reasonCodes: ["REVIEW_DUE"] }],
  });
  assert.equal(plan.items.length, 1);
  const duplicate = { ...plan, items: [plan.items[0], { ...plan.items[0], id: IDS.attempt, status: "started" }] };
  assert.throws(() => validatePlan(duplicate), /subjectKey/);
  assert.throws(() => validatePlan({ ...plan, items: Array.from({ length: TRAINING_LIMITS.planItems + 1 }, () => plan.items[0]) }), /最多/);
});

test("手动尝试保留独立完成证据，导入不能伪造它", () => {
  const event = validateAttemptEvent({
    schemaVersion: 1, id: IDS.event, type: "attempt.recorded", memberId: "member-example", subjectKey: "problem:Codeforces|123A",
    recordRef, problem, performedOn: "2026-09-05", recordedAt: updatedAt, sequence: 8,
    mode: "review", outcome: "independent", durationMinutes: 35, errorTags: [], note: "证明", source: { kind: "manual" },
  });
  assert.equal(event.outcome, "independent");
  assert.throws(() => validateAttemptEvent({ ...event, id: IDS.attempt, source: { kind: "import", platform: "Codeforces", handle: "user", submissionId: "1", verdict: "OK" } }), /independent/);
  assert.throws(() => validateAttemptEvent({ ...event, id: IDS.attempt, outcome: "unknown" }), /手动/);
});

test("尝试纠错、作废与复习事件都只接受各自字段", () => {
  const corrected = validateAttemptEvent({ schemaVersion: 1, id: IDS.event, type: "attempt.corrected", memberId: "member-example", recordedAt: updatedAt, sequence: 9, targetAttemptId: IDS.attempt, patch: { note: "修正" } });
  assert.equal(corrected.patch.note, "修正");
  assert.throws(() => validateAttemptEvent({ ...corrected, patch: { source: { kind: "manual" } } }), /未知字段/);
  const reviewEvent = validateAttemptEvent({ schemaVersion: 1, id: IDS.event, type: "review.deferred", memberId: "member-example", recordedAt: updatedAt, sequence: 10, subjectKey: "problem:Codeforces|123A", dueOn: "2026-09-08" });
  assert.equal(reviewEvent.dueOn, "2026-09-08");
});

test("Review 强制 scheduled 的日期，并让暂停和归档显式存 null", () => {
  const review = validateReview({ schemaVersion: 1, memberId: "member-example", subjectKey: "problem:Codeforces|123A", state: "scheduled", dueOn: "2026-09-08", successStreak: 1, lastAttemptId: IDS.attempt, lastReviewedOn: "2026-09-05", appliedSequence: 8 });
  assert.equal(review.state, "scheduled");
  assert.throws(() => validateReview({ ...review, state: "paused", dueOn: "2026-09-08" }), /null/);
  assert.equal(validateReview({ ...review, state: "archived", dueOn: null }).dueOn, null);
});

test("SelfAssessment 是自评且拒绝超长 Unicode note", () => {
  const assessment = validateSelfAssessment({ schemaVersion: 1, memberId: "member-example", nodeId: "dp", level: "comfortable", updatedAt, note: "自己感觉稳定" });
  assert.equal(assessment.level, "comfortable");
  assert.throws(() => validateSelfAssessment({ ...assessment, note: "😀".repeat(501) }), /500/);
});
