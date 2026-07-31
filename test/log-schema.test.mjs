import test from "node:test";
import assert from "node:assert/strict";
import { LOG_LIMITS, LOG_SCHEMA_VERSION, isDateString, logInputBytes, metaFromProblems, normalizeMeta, validateLogInput } from "../lib/log-schema.mjs";

test("旧 meta 会得到可重复的兼容 ID", () => {
  const result = normalizeMeta({ problems: [{ name: "P1000", platform: "洛谷" }] }, { legacyIdPrefix: "廖夏-2026-07-25" });
  assert.equal(result.schemaVersion, LOG_SCHEMA_VERSION);
  assert.match(result.problems[0].id, /^legacy-[a-z0-9]+$/);
  assert.equal(result.problems[0].id, normalizeMeta({ problems: [{ name: "P1000" }] }, { legacyIdPrefix: "廖夏-2026-07-25" }).problems[0].id);
});

test("日志输入会保留永久 ID 并拒绝重复 ID", () => {
  const valid = validateLogInput({ problems: [{ id: "abc_123", name: "A" }] });
  assert.equal(valid.problems[0].id, "abc_123");
  assert.throws(() => validateLogInput({ problems: [{ id: "same", name: "A" }, { id: "same", name: "B" }] }), /不可重复/);
});

test("日期必须是真实 ISO 日期", () => {
  assert.equal(isDateString("2026-07-25"), true);
  assert.equal(isDateString("2026-02-30"), false);
});

test("标签去重清洗且旧日志获得默认错题状态", () => {
  const normalized = normalizeMeta({ problems: [{ name: "A", tags: ["DP", " DP ", "", "图论"] }] });
  assert.deepEqual(normalized.problems[0].tags, ["DP", "图论"]);
  assert.equal(normalized.problems[0].reviewStatus, "none");
  assert.equal(normalized.problems[0].problemNumber, "");
});

test("题号会清洗并保存在元数据中", () => {
  const result = validateLogInput({ problems: [{ id: "p1", name: "A", platform: "Codeforces", problemNumber: " 4A " }] });
  assert.equal(result.problems[0].problemNumber, "4A");
  assert.equal(metaFromProblems(result.problems).problems[0].problemNumber, "4A");
  assert.equal(normalizeMeta({ problems: [{ name: "A", problemNumber: " P1000 " }] }).problems[0].problemNumber, "P1000");
});

test("错题状态只接受约定值", () => {
  const result = validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "二分，贪心, 二分", reviewStatus: "todo" }],
  });
  assert.deepEqual(result.problems[0].tags, ["二分", "贪心"]);
  assert.equal(result.problems[0].reviewStatus, "todo");

  const fallback = validateLogInput({ problems: [{ id: "p2", name: "B", reviewStatus: "unknown" }] });
  assert.equal(fallback.problems[0].reviewStatus, "none");
});

test("标签同时支持顿号（、）和中英文逗号（, ，）作为分隔符", () => {
  const r1 = validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "DP、图论、二分", reviewStatus: "todo" }],
  });
  assert.deepEqual(r1.problems[0].tags, ["DP", "图论", "二分"]);

  const r2 = validateLogInput({
    problems: [{ id: "p2", name: "B", tags: "DP, 图论, 二分", reviewStatus: "none" }],
  });
  assert.deepEqual(r2.problems[0].tags, ["DP", "图论", "二分"]);

  const r3 = validateLogInput({
    problems: [{ id: "p3", name: "C", tags: "DP，图论，二分", reviewStatus: "none" }],
  });
  assert.deepEqual(r3.problems[0].tags, ["DP", "图论", "二分"]);

  const r4 = validateLogInput({
    problems: [{ id: "p4", name: "D", tags: "DP、图论, 二分，dfs", reviewStatus: "none" }],
  });
  assert.deepEqual(r4.problems[0].tags, ["DP", "图论", "二分", "DFS"]);

  const r5 = validateLogInput({
    problems: [{ id: "p5", name: "E", tags: ["暴力、模拟", "枚举，模拟"], reviewStatus: "none" }],
  });
  assert.deepEqual(r5.problems[0].tags, ["暴力", "模拟", "枚举"]);

  const legacy = normalizeMeta({ problems: [{ name: "F", tags: ["暴力、模拟"] }] });
  assert.deepEqual(legacy.problems[0].tags, ["暴力", "模拟"]);
});

test("单日题目数量限制为 15 道", () => {
  const problems = Array.from({ length: LOG_LIMITS.maxProblems }, (_, index) => ({ id: `p${index}`, name: `题目 ${index}` }));
  assert.equal(validateLogInput({ problems }).problems.length, LOG_LIMITS.maxProblems);
  assert.throws(() => validateLogInput({ problems: [...problems, { id: "overflow", name: "超限" }] }), /1 到 15 道题/);
});

test("字段和总提交大小超限时明确拒绝而不是截断", () => {
  assert.throws(() => validateLogInput({ problems: [{ id: "p1", name: "A", code: "x".repeat(LOG_LIMITS.code + 1) }] }), /代码不能超过/);
  const input = { problems: [{ id: "p1", name: "A", code: "汉".repeat(499_999) }] };
  assert.ok(logInputBytes(input) > LOG_LIMITS.maxRequestBytes);
  assert.throws(() => validateLogInput(input), /1.5 MB/);
});

test("标签大小写归一化：Dfs/dFs/DFS 统一为 DFS，dp/bFs/StL 统一为大写", () => {
  assert.deepEqual(validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "Dfs, dFs, DFS" }],
  }).problems[0].tags, ["DFS"]);

  assert.deepEqual(validateLogInput({
    problems: [{ id: "p2", name: "B", tags: "dp, bFs, StL" }],
  }).problems[0].tags, ["DP", "BFS", "STL"]);
});

test("标签别名映射：深搜->DFS，记忆化->记忆化搜索，大模拟->模拟", () => {
  const r1 = validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "深搜, 广搜" }],
  });
  assert.deepEqual(r1.problems[0].tags, ["DFS", "BFS"]);

  const r2 = validateLogInput({
    problems: [{ id: "p2", name: "B", tags: "记忆化" }],
  });
  assert.deepEqual(r2.problems[0].tags, ["记忆化搜索"]);

  const r3 = validateLogInput({
    problems: [{ id: "p3", name: "C", tags: "大模拟" }],
  });
  assert.deepEqual(r3.problems[0].tags, ["模拟"]);
});

test("复合标签拆分：暴力枚举->暴力+枚举，贪心构造->贪心+构造，二分搜索->二分+搜索", () => {
  const r1 = validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "暴力枚举" }],
  });
  assert.deepEqual(r1.problems[0].tags, ["暴力", "枚举"]);

  const r2 = validateLogInput({
    problems: [{ id: "p2", name: "B", tags: "贪心构造" }],
  });
  assert.deepEqual(r2.problems[0].tags, ["贪心", "构造"]);

  const r3 = validateLogInput({
    problems: [{ id: "p3", name: "C", tags: "二分搜索, DFS搜索" }],
  });
  assert.deepEqual(r3.problems[0].tags, ["二分", "搜索", "DFS"]);

  const r4 = validateLogInput({
    problems: [{ id: "p4", name: "D", tags: "暴力枚举, 暴力" }],
  });
  assert.deepEqual(r4.problems[0].tags, ["暴力", "枚举"]);
});

test("标签复合拆分与大小写归一化同时生效", () => {
  const r = validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "递推dp, dfs搜索, 暴力搜索" }],
  });
  assert.deepEqual(r.problems[0].tags, ["递推", "DP", "DFS", "暴力", "搜索"]);
});

test("dynamic programming alias (DP)", () => {
  const r = validateLogInput({
    problems: [{ id: "p1", name: "A", tags: "动态规划" }],
  });
  assert.deepEqual(r.problems[0].tags, ["DP"]);
});