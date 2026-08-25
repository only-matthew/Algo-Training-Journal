import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { problemStableKey } from "../lib/log-schema.mjs";

// 平台名归一化：把常见的异写（如 CodeForces）统一为规范值。
export const PLATFORM_ALIASES = {
  "洛谷": "洛谷",
  "CodeForces": "Codeforces",
  "Codeforces": "Codeforces",
  "AtCoder": "AtCoder",
  "UVA": "UVA",
  "HDU": "HDU",
  "POJ": "POJ",
  "OpenJ_Bailian": "OpenJ_Bailian",
  "SPOJ": "SPOJ",
  "LibreOJ": "LibreOJ",
  "UniversalOJ": "UniversalOJ",
};

export function normalizePlatform(p) {
  const s = String(p || "").trim();
  return PLATFORM_ALIASES[s] ?? s;
}

export function problemKey(platform, number) {
  return problemStableKey(normalizePlatform(platform), number);
}

// 读取 curriculum 目录：roadmap.json + nodes/*.json。
// roadmap.json 兼容两种形态：阶段数组，或 { schemaVersion, phases: [...] }。
// 返回 { phases, nodes: Map<id, node> }。
export function readCurriculum(dir = "curriculum") {
  const roadmap = JSON.parse(readFileSync(join(dir, "roadmap.json"), "utf8"));
  const phases = Array.isArray(roadmap) ? roadmap : roadmap.phases;
  const nodes = new Map();
  const nodesDir = join(dir, "nodes");
  for (const file of readdirSync(nodesDir)) {
    if (!file.endsWith(".json")) continue;
    const node = JSON.parse(readFileSync(join(nodesDir, file), "utf8"));
    if (node && typeof node.id === "string" && node.id) nodes.set(node.id, node);
  }
  return { phases, nodes };
}

// 校验 curriculum 数据，任一失败 throw new Error(描述)，全部通过返回 true。
export function validateCurriculum(data) {
  const { phases, nodes } = data;
  if (!Array.isArray(phases) || phases.length === 0) {
    throw new Error("curriculum: phases 必须是非空数组");
  }
  const phaseIds = new Set();
  for (const phase of phases) {
    if (phaseIds.has(phase.id)) throw new Error(`curriculum: phase id 重复：${phase.id}`);
    phaseIds.add(phase.id);
  }

  const phaseNodeIds = new Set();
  for (const phase of phases) {
    for (const id of phase.nodes || []) phaseNodeIds.add(id);
  }
  const nodeIds = new Set(nodes.keys());
  const missing = [...phaseNodeIds].filter((id) => !nodeIds.has(id));
  if (missing.length > 0) {
    throw new Error(`curriculum: phase 引用了不存在的节点：${missing.join(", ")}`);
  }
  const extra = [...nodeIds].filter((id) => !phaseNodeIds.has(id));
  if (extra.length > 0) {
    throw new Error(`curriculum: 存在未纳入任何 phase 的节点：${extra.join(", ")}`);
  }

  const validPlatforms = new Set(Object.values(PLATFORM_ALIASES));
  for (const node of nodes.values()) {
    if (!node.id || typeof node.id !== "string") {
      throw new Error("curriculum: 存在 node.id 为空的节点");
    }
    if (!Array.isArray(node.problems) || node.problems.length === 0) {
      throw new Error(`curriculum: 节点 ${node.id} 的 problems 必须是非空数组`);
    }
    if (!Number.isInteger(node.difficulty) || node.difficulty < 1 || node.difficulty > 10) {
      throw new Error(`curriculum: 节点 ${node.id} 的 difficulty 必须是 1-10 的整数，实际为 ${node.difficulty}`);
    }
    for (const problem of node.problems) {
      const normalized = normalizePlatform(problem && problem.platform);
      if (!validPlatforms.has(normalized)) {
        throw new Error(
          `curriculum: 节点 ${node.id} 题目 ${problem && problem.number ? problem.number : ""} 的平台无效：${problem && problem.platform ? problem.platform : ""}`
        );
      }
    }
  }
  return true;
}

// 构建 题key -> 记录数组 的索引。
// 同一 member 对同一 key 只保留 date 最新的一条（YYYY-MM-DD 字符串可直接比较）。
export function buildMatchIndex(logs) {
  const index = new Map();
  for (const entry of logs || []) {
    const key = problemKey(entry.platform, entry.problemNumber);
    if (!key) continue;
    const record = {
      member: entry.member,
      date: entry.date,
      problemId: entry.problemId,
      reviewStatus: entry.reviewStatus,
      difficulty: entry.difficulty,
      problem: entry.problem,
    };
    const list = index.get(key);
    if (!list) {
      index.set(key, [record]);
      continue;
    }
    const existing = list.findIndex((r) => r.member === entry.member);
    if (existing === -1) {
      list.push(record);
    } else if (list[existing].date <= record.date) {
      list[existing] = record;
    }
  }
  return index;
}

// 按题目列表计算统计（列表内每道题独立计一次；调用方负责去重）。
function computeStats(problems, matchIndex, totalProblems) {
  let done = 0;
  let mastered = 0;
  let review = 0;
  const memberMap = new Map(); // member -> { member, done, mastered, review }
  for (const problem of problems) {
    const key = problemKey(problem.platform, problem.number);
    const records = key ? matchIndex.get(key) : undefined;
    if (!records || records.length === 0) continue;
    done += 1;
    if (records.some((r) => r.reviewStatus === "mastered")) mastered += 1;
    if (records.some((r) => r.reviewStatus === "todo")) review += 1;
    for (const r of records) {
      let m = memberMap.get(r.member);
      if (!m) {
        m = { member: r.member, done: 0, mastered: 0, review: 0 };
        memberMap.set(r.member, m);
      }
      m.done += 1;
      if (r.reviewStatus === "mastered") m.mastered += 1;
      if (r.reviewStatus === "todo") m.review += 1;
    }
  }
  const byMember = [...memberMap.values()]
    .sort((a, b) => a.member.localeCompare(b.member, "zh-CN"))
    .map((m) => ({ ...m, pct: Math.round((m.done / totalProblems) * 100) }));
  return {
    totalProblems,
    done,
    mastered,
    review,
    pct: Math.round((done / totalProblems) * 100),
    byMember,
  };
}

export function computeNodeStats(node, matchIndex) {
  return computeStats(node.problems, matchIndex, node.problems.length);
}

// 合并所有节点题目，按 problemKey 全局去重（保留第一次出现的 problem），再按相同语义统计。
export function computePhaseStats(nodes, matchIndex) {
  const seen = new Set();
  const problems = [];
  for (const node of nodes || []) {
    for (const problem of node.problems) {
      const key = problemKey(problem.platform, problem.number);
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(problem);
    }
  }
  return computeStats(problems, matchIndex, problems.length);
}
