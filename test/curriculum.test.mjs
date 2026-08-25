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

test("NOI 大纲与蓝桥杯考点已合并进知识树节点（无孤立知识清单节点）", () => {
  const data = readCurriculum("curriculum");
  // 不再存在 noi-* / lq-* 知识清单节点与对应阶段
  for (const id of data.nodes.keys()) {
    assert.ok(!id.startsWith("noi-"), `不应存在 NOI 知识清单节点 ${id}`);
    assert.ok(!id.startsWith("lq-"), `不应存在蓝桥杯知识清单节点 ${id}`);
  }
  // 每个节点都带 NOI/蓝桥杯标签数组（可为空）
  for (const node of data.nodes.values()) {
    assert.ok(Array.isArray(node.noiLabels), `节点 ${node.id} 缺少 noiLabels`);
    assert.ok(Array.isArray(node.lanqiaoLabels), `节点 ${node.id} 缺少 lanqiaoLabels`);
    assert.ok(Array.isArray(node.noiLevels), `节点 ${node.id} 缺少 noiLevels`);
    assert.ok(Array.isArray(node.lanqiao), `节点 ${node.id} 缺少 lanqiao`);
  }
  // 抽查关键标签归并：KMP → 字符串；LCA/树链剖分 → 树；逆元/CRT → 进阶数论
  const find = (id) => data.nodes.get(id);
  assert.ok((find("string-basics").noiLabels || []).some((l) => l.includes("KMP")));
  assert.ok((find("string-basics").lanqiaoLabels || []).some((l) => l.includes("KMP")));
  assert.ok((find("graph-tree").noiLabels || []).some((l) => l.includes("LCA")));
  assert.ok((find("graph-tree").lanqiaoLabels || []).some((l) => l.includes("LCA") || l.includes("最近共同祖先")));
  assert.ok((find("math-number-theory").noiLabels || []).some((l) => l.includes("逆元")));
  assert.ok((find("math-number-theory").noiLabels || []).some((l) => l.includes("中国剩余定理")));
  assert.ok((find("math-number-theory").lanqiaoLabels || []).some((l) => l.includes("逆元")));
  assert.ok((find("algo-sorting").lanqiaoLabels || []).some((l) => l.includes("排序")));
});
