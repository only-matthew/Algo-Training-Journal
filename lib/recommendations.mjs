import { problemSubjectKey } from "./problem-identity.mjs";

export const RECOMMENDATION_REASONS = Object.freeze({
  REVIEW_DUE: "已到复习日期", UPSOLVE_PENDING: "上次尚未完成，继续补题", FOCUS_NODE: "来自你选择的专题",
  NEXT_NODE: "来自当前可开始的学习节点", PREREQUISITE_SELF_ASSESSED: "依据你的前置知识自评",
  NO_EVIDENCE: "暂无训练证据，从基础候选开始", NO_CANDIDATES: "当前候选已用完，可调整专题或手动加题",
});
export const REASON_CODES = Object.freeze(Object.fromEntries(Object.keys(RECOMMENDATION_REASONS).map((key) => [key, key])));

export function problemUrl(problem) {
  const number = String(problem?.problemNumber || "").replace(/\s/g, "");
  if (problem?.platform === "洛谷" && /^[A-Za-z0-9_-]+$/.test(number)) return `https://www.luogu.com.cn/problem/${number.toUpperCase()}`;
  if (/^Codeforces$/i.test(problem?.platform || "") && /^\d+[A-Za-z]\d?$/.test(number)) {
    const [, contest, index] = /^(\d+)([A-Za-z]\d?)$/.exec(number);
    return `https://codeforces.com/problemset/problem/${contest}/${index.toUpperCase()}`;
  }
  if (problem?.platform === "AtCoder" && /^[A-Za-z0-9-]+_[A-Za-z0-9_]+$/.test(number)) return `https://atcoder.jp/contests/${number.split("_")[0].toLowerCase()}/tasks/${number.toLowerCase()}`;
  return null;
}

export function catalogProblem(problem) {
  return { name: problem.name, platform: problem.platform, problemNumber: problem.problemNumber ?? problem.number ?? "",
    ...(problem.difficulty ? { difficulty: String(problem.difficulty) } : {}) };
}

// Deterministic and read-only: accepting a candidate is a separate plan write.
export function recommendV1({ today, profile = {}, plan, attempts = [], legacyRecords = [], reviews = [], nodes = [], assessments = [], exclude = [] }) {
  const legacyInput = arguments[0] || {};
  const legacyMode = Boolean(legacyInput.curriculum);
  const curriculum = legacyInput.curriculum;
  if (curriculum) {
    nodes = curriculum.nodes || [];
    const evidence = legacyInput.evidence || {};
    legacyRecords = (evidence.historicalSubjectKeys || []).map((subjectKey) => ({ subjectKey }));
    attempts = (evidence.independentSubjectKeys || []).map((subjectKey) => ({ subjectKey, outcome: "independent" }));
    assessments = Object.entries(evidence.selfAssessments || {}).map(([nodeId, level]) => ({ nodeId, level }));
    for (const item of evidence.upsolvePending || []) attempts.push({ ...item, mode: "upsolve", outcome: "unfinished" });
  }
  const active = (plan?.items || []).filter((item) => ["queued", "started", "completed"].includes(item.status));
  const excluded = new Set([...exclude, ...active.map((item) => item.subjectKey)]);
  const practiced = new Set((legacyMode ? (legacyInput.evidence?.historicalSubjectKeys || []) : [...attempts, ...legacyRecords].map((item) => item.subjectKey)));
  const independent = new Set(attempts.filter((item) => item.outcome === "independent").map((item) => item.subjectKey));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const comfortable = new Set(assessments.filter((item) => item.level === "comfortable").map((item) => item.nodeId));
  const hasIndependent = (id) => (byId.get(id)?.problems || []).some((problem) => independent.has(problemSubjectKey(problem.platform, problem.number ?? problem.problemNumber)));
  const canEnter = (node) => (node.prerequisites || []).every((id) => hasIndependent(id) || comfortable.has(id));
  const candidates = [];
  const add = (item) => {
    if (!item.subjectKey || !item.problem || excluded.has(item.subjectKey)) return;
    excluded.add(item.subjectKey);
    candidates.push({ ...item, plannedMinutes: 20 });
  };
  for (const review of [...reviews].filter((item) => item.state === "scheduled" && item.dueOn && item.dueOn <= today).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.subjectKey.localeCompare(b.subjectKey))) {
    add({ subjectKey: review.subjectKey, problem: review.problem, kind: "review", reasonCodes: ["REVIEW_DUE"], dueOn: review.dueOn, ...(review.recordRef ? { recordRef: review.recordRef } : {}) });
  }
  const latestUpsolve = new Map();
  for (const attempt of [...attempts].sort((a, b) => a.performedOn.localeCompare(b.performedOn) || a.sequence - b.sequence)) if (attempt.mode === "upsolve") latestUpsolve.set(attempt.subjectKey, attempt);
  for (const attempt of latestUpsolve.values()) if (attempt.outcome === "unfinished") add({ subjectKey: attempt.subjectKey, problem: attempt.problem, recordRef: attempt.recordRef, kind: "upsolve", reasonCodes: ["UPSOLVE_PENDING"] });
  const focus = (profile.focusNodeIds || []).map((id) => byId.get(id)).filter(Boolean);
  const selected = focus.length ? focus : nodes.filter(canEnter).slice(0, 1);
  const appendNode = (node, kind, reason) => {
    for (const item of node.problems || []) {
      const problem = item.problem ? item.problem : catalogProblem(item);
      const subjectKey = item.subjectKey || problemSubjectKey(problem.platform, problem.problemNumber);
      if (practiced.has(subjectKey)) continue;
      const reasonCodes = [reason];
      if (!practiced.size) reasonCodes.push("NO_EVIDENCE");
      if ((node.prerequisites || []).some((id) => comfortable.has(id) && !hasIndependent(id))) reasonCodes.push("PREREQUISITE_SELF_ASSESSED");
      add({ subjectKey, problem, nodeId: node.id, kind, reasonCodes, ...(reason === "NEXT_NODE" && node.prerequisites?.length ? { prerequisiteNodeIds: node.prerequisites } : {}) });
    }
  };
  for (const node of selected) appendNode(node, "practice", focus.length ? "FOCUS_NODE" : "NEXT_NODE");
  if (legacyMode && focus.length) for (const node of nodes.filter((candidate) => !selected.includes(candidate)).slice(0, 1)) appendNode(node, "practice", "NEXT_NODE");
  const selectedIds = new Set(selected.map((node) => node.id));
  if (focus.length) for (const node of nodes) if (!selectedIds.has(node.id) && (node.prerequisites || []).some((id) => selectedIds.has(id)) && canEnter(node)) appendNode(node, "advance", "NEXT_NODE");
  const count = Math.min(profile.dailyItemLimit ?? 3, Math.max(0, 10 - active.length));
  const budget = Math.max(0, (profile.dailyBudgetMinutes ?? 60) - active.reduce((sum, item) => sum + (item.plannedMinutes || 20), 0));
  const items = candidates.slice(0, Math.min(count, budget > 0 ? Math.max(1, Math.ceil(budget / 20)) : active.length ? 0 : 1));
  const result = { algorithmVersion: "recommend-v1", items, candidates: items, reasonCodes: items.length ? [] : ["NO_CANDIDATES"] };
  return result;
}
