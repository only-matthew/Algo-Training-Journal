import assert from "node:assert/strict";
import test from "node:test";
import { assessMastery } from "../lib/mastery.mjs";

test("掌握度：无训练记录为未接触", () => {
  const result = assessMastery({}, "2026-08-28");
  assert.equal(result.state, "未接触");
  assert.equal(result.confidence, "无");
});

test("掌握度：到期待复习优先提示复习", () => {
  const result = assessMastery({ totalRecords: 8, masteredRecords: 3, overdueReviewRecords: 1, lastTrainedAt: "2026-08-27" }, "2026-08-28");
  assert.equal(result.state, "建议复习");
  assert.match(result.reason, /已到期/);
});

test("掌握度：长期未练提示巩固", () => {
  const result = assessMastery({ totalRecords: 5, lastTrainedAt: "2026-05-01" }, "2026-08-28");
  assert.equal(result.state, "建议复习");
  assert.equal(result.daysSinceTraining, 119);
});

test("掌握度：训练量与已掌握状态构成较熟练证据", () => {
  const result = assessMastery({ totalRecords: 5, masteredRecords: 1, lastTrainedAt: "2026-08-20" }, "2026-08-28");
  assert.equal(result.state, "较熟练");
  assert.equal(result.confidence, "高");
});

test("掌握度：训练证据不足时保持已接触", () => {
  const result = assessMastery({ totalRecords: 2, lastTrainedAt: "2026-08-20" }, "2026-08-28");
  assert.equal(result.state, "已接触");
  assert.match(result.action, /2 道/);
});
