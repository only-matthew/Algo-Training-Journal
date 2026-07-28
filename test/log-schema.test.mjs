import test from "node:test";
import assert from "node:assert/strict";
import { LOG_SCHEMA_VERSION, isDateString, metaFromProblems, normalizeMeta, validateLogInput } from "../lib/log-schema.mjs";

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
