import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildProblemIndex, buildReviewQueue } = require("../scripts/generate-data.js");

const LOGS = [
  { member: "廖夏", date: "2026-08-01", problemIndex: 0, problemId: "a", problem: "最大子段和", platform: "洛谷", problemNumber: "P1115", reviewStatus: "todo", reviewDue: "2026-08-03", difficulty: "普及-", tags: ["DP"] },
  { member: "王梓豪", date: "2026-08-02", problemIndex: 0, problemId: "b", problem: "最大子段和", platform: "洛谷", problemNumber: "P1115", reviewStatus: "mastered", reviewDue: undefined, difficulty: "普及-", tags: [] },
  { member: "廖夏", date: "2026-08-02", problemIndex: 1, problemId: "c", problem: "无题号题目", platform: "洛谷", problemNumber: "", reviewStatus: "todo", reviewDue: "2026-08-10", difficulty: "", tags: [] },
  { member: "郭一鸣", date: "2026-08-03", problemIndex: 0, problemId: "d", problem: "Watermelon", platform: "Codeforces", problemNumber: "4A", reviewStatus: "none", difficulty: "", tags: [] },
  { member: "郭一鸣", date: "2026-08-04", problemIndex: 0, problemId: "e", problem: "Watermelon", platform: "Codeforces", problemNumber: "4a", reviewStatus: "todo", reviewDue: "2026-08-02", difficulty: "", tags: [] },
];

test("buildProblemIndex 按平台+归一化题号聚合全队同题记录", async () => {
  const index = await buildProblemIndex(LOGS);
  assert.equal(index.size, 2); // P1115 与 4A（4a 归一化）
  const luogu = index.get("洛谷|P1115");
  assert.equal(luogu.length, 2);
  assert.deepEqual(luogu.map((r) => r.member).sort(), ["廖夏", "王梓豪"]);
  assert.ok(luogu.every((r) => r.problemId && r.date));
  // 无题号的记录不参与聚合
  assert.equal(index.has("洛谷|"), false);
  const cf = index.get("Codeforces|4A");
  assert.equal(cf.length, 2);
});

test("buildReviewQueue 只收集待复习且带日期的题，并按日期升序", () => {
  const queue = buildReviewQueue(LOGS);
  assert.equal(queue.length, 3); // a、c、e（b 已掌握、d 非错题）
  assert.deepEqual(queue.map((q) => q.reviewDue), ["2026-08-02", "2026-08-03", "2026-08-10"]);
  assert.ok(queue.every((q) => q.problemId && q.member && q.problem));
  // 未设置复习日期的待复习题不会进入队列
  const noDue = buildReviewQueue([{ ...LOGS[0], reviewDue: undefined }]);
  assert.equal(noDue.length, 0);
});
