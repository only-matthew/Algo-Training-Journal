import assert from "node:assert/strict";
import test from "node:test";
import { patchProblemReview, dueDateInDays } from "../lib/review-utils.mjs";

const problems = [
  { id: "a1", problem: "题A", reviewStatus: "todo", reviewDue: "2026-08-25" },
  { id: "b2", problem: "题B", reviewStatus: "todo", reviewDue: "2026-08-28" },
];

test("patchProblemReview 命中时替换目标题且不可变", () => {
  const next = patchProblemReview(problems, "b2", { reviewStatus: "mastered", reviewDue: undefined });
  assert.equal(next.length, 2);
  assert.equal(next[1].reviewStatus, "mastered");
  // reviewDue: undefined 在 JSON 序列化（saveDateLog 的请求体）时会被省略
  assert.equal(next[1].reviewDue, undefined);
  // 原数组与原始对象不被修改
  assert.equal(problems[1].reviewStatus, "todo");
  assert.equal(problems[1].reviewDue, "2026-08-28");
  // 未命中的项保持原引用
  assert.equal(next[0], problems[0]);
});

test("patchProblemReview 未命中时返回原数组引用", () => {
  const next = patchProblemReview(problems, "nope", { reviewStatus: "mastered" });
  assert.equal(next, problems);
});

test("patchProblemReview 空数组与空 id 容错", () => {
  const empty = [];
  assert.equal(patchProblemReview(empty, "x", {}), empty); // 未命中返回原引用
  assert.equal(patchProblemReview(undefined, "x", {}), undefined);
});

test("dueDateInDays 按固定基准日期计算", () => {
  const base = new Date("2026-08-28T12:00:00");
  assert.equal(dueDateInDays(0, base), "2026-08-28");
  assert.equal(dueDateInDays(3, base), "2026-08-31");
  assert.equal(dueDateInDays(-1, base), "2026-08-27");
  assert.equal(dueDateInDays(1, new Date("2026-07-31T23:00:00")), "2026-08-01");
});

test("dueDateInDays 默认使用当前时间且格式为 YYYY-MM-DD", () => {
  const result = dueDateInDays(3);
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  const expected = new Date();
  expected.setDate(expected.getDate() + 3);
  const y = expected.getFullYear();
  const m = String(expected.getMonth() + 1).padStart(2, "0");
  const d = String(expected.getDate()).padStart(2, "0");
  assert.equal(result, `${y}-${m}-${d}`);
});
