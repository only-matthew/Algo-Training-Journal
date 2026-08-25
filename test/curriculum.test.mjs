import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePlatform,
  problemKey,
  readCurriculum,
  validateCurriculum,
  buildMatchIndex,
  computeNodeStats,
  computePhaseStats,
} from "../scripts/curriculum.mjs";

test("normalizePlatform 统一平台名", () => {
  assert.equal(normalizePlatform("CodeForces"), "Codeforces");
  assert.equal(normalizePlatform("Codeforces"), "Codeforces");
  assert.equal(normalizePlatform("洛谷"), "洛谷");
  assert.equal(normalizePlatform("AtCoder"), "AtCoder");
  assert.equal(normalizePlatform("UVA"), "UVA");
  assert.equal(normalizePlatform("HDU"), "HDU");
  assert.equal(normalizePlatform("未知平台"), "未知平台");
  assert.equal(normalizePlatform(""), "");
  assert.equal(normalizePlatform(undefined), "");
});

test("problemKey 与 problemStableKey 语义一致（题号大写去空白）", () => {
  assert.equal(problemKey("CodeForces", "25e"), "Codeforces|25E");
  assert.equal(problemKey("洛谷", "p1001"), "洛谷|P1001");
  assert.equal(problemKey("AtCoder", "agc012_e"), "AtCoder|AGC012_E");
  assert.equal(problemKey("洛谷", ""), "");
  assert.equal(problemKey("", "P1001"), "");
});

const sampleNode = {
  id: "n1",
  title: "样例",
  difficulty: 4,
  problems: [
    { platform: "洛谷", number: "P1001" },
    { platform: "洛谷", number: "P1002" },
    { platform: "Codeforces", number: "1A" },
  ],
};

const sampleLogs = [
  { member: "甲", date: "2026-08-01", platform: "洛谷", problemNumber: "P1001", reviewStatus: "none", problem: "题1", problemId: "a" },
  { member: "甲", date: "2026-08-02", platform: "洛谷", problemNumber: "P1001", reviewStatus: "todo", problem: "题1", problemId: "b" },
  { member: "乙", date: "2026-08-01", platform: "洛谷", problemNumber: "P1002", reviewStatus: "mastered", problem: "题2", problemId: "c" },
];

test("buildMatchIndex 同成员同题保留最新日期", () => {
  const index = buildMatchIndex(sampleLogs);
  const records = index.get(problemKey("洛谷", "P1001"));
  assert.equal(records.length, 1);
  assert.equal(records[0].member, "甲");
  assert.equal(records[0].date, "2026-08-02");
  assert.equal(records[0].reviewStatus, "todo");
  assert.equal(index.get(problemKey("洛谷", "P1002"))[0].member, "乙");
});

test("computeNodeStats 统计与 byMember", () => {
  const stats = computeNodeStats(sampleNode, buildMatchIndex(sampleLogs));
  assert.equal(stats.totalProblems, 3);
  assert.equal(stats.done, 2); // P1001、P1002 有记录，1A 无
  assert.equal(stats.mastered, 1); // P1002
  assert.equal(stats.review, 1); // P1001（最新记录为 todo）
  assert.equal(stats.pct, 67);
  const byMember = stats.byMember.find((m) => m.member === "甲");
  assert.equal(byMember.done, 1);
  assert.equal(byMember.review, 1);
  assert.equal(byMember.mastered, 0);
});

test("computePhaseStats 跨节点按题去重", () => {
  const node2 = { id: "n2", problems: [{ platform: "洛谷", number: "P1001" }, { platform: "洛谷", number: "P1003" }] };
  const stats = computePhaseStats([sampleNode, node2], buildMatchIndex(sampleLogs));
  assert.equal(stats.totalProblems, 4); // P1001 去重后：P1001、P1002、1A、P1003
  assert.equal(stats.done, 2); // 有记录的：P1001、P1002
  assert.equal(stats.mastered, 1);
  assert.equal(stats.review, 1);
});

test("validateCurriculum 接受合法数据并拒绝非法数据", () => {
  const nodes = new Map([
    ["n1", { id: "n1", difficulty: 4, problems: [{ platform: "洛谷", number: "P1001" }] }],
  ]);
  const data = { phases: [{ id: "p0", nodes: ["n1"] }], nodes };
  assert.equal(validateCurriculum(data), true);

  const badPlatform = new Map([
    ["n1", { id: "n1", difficulty: 4, problems: [{ platform: "不存在", number: "X1" }] }],
  ]);
  assert.throws(() => validateCurriculum({ phases: [{ id: "p0", nodes: ["n1"] }], nodes: badPlatform }), /平台无效/);

  const missingPhaseRef = new Map([
    ["n1", { id: "n1", difficulty: 4, problems: [{ platform: "洛谷", number: "P1001" }] }],
  ]);
  assert.throws(() => validateCurriculum({ phases: [{ id: "p0", nodes: ["n1", "n2"] }], nodes: missingPhaseRef }), /不存在/);

  const badDifficulty = new Map([
    ["n1", { id: "n1", difficulty: 11, problems: [{ platform: "洛谷", number: "P1001" }] }],
  ]);
  assert.throws(() => validateCurriculum({ phases: [{ id: "p0", nodes: ["n1"] }], nodes: badDifficulty }), /difficulty/);

  assert.throws(() => validateCurriculum({ phases: [], nodes }), /phases/);
});

test("readCurriculum 读取真实数据并通过校验（若存在）", () => {
  const data = readCurriculum("curriculum");
  assert.ok(data.phases.length > 0);
  assert.ok(data.nodes.size > 0);
  assert.equal(validateCurriculum(data), true);
  // 阶段节点覆盖与节点文件一致
  const phaseNodeIds = new Set();
  for (const phase of data.phases) for (const id of phase.nodes) phaseNodeIds.add(id);
  assert.equal(phaseNodeIds.size, data.nodes.size);
});
