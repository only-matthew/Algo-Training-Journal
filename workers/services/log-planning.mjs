import { metaFromProblems } from "../../lib/log-schema.mjs";
import { normalizeLearningState } from "../../lib/learning-state.mjs";
import { subjectKeyForProblem } from "../../lib/problem-identity.mjs";
import { catalogProblem } from "../../lib/recommendations.mjs";
import { statementImagePath, statementPath } from "./logs-v2.mjs";
import { trainingPaths } from "./training.mjs";

/** Compute the Git blob SHA-1 for text or raw bytes. */
export async function gitBlobSha(content) {
  const encoder = new TextEncoder();
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const combined = new Uint8Array(header.length + bytes.length);
  combined.set(header);
  combined.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", combined);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function logRoots(member, date) {
  const [year, month, day] = date.split("-");
  return [`logs/${member}/${year}/${month}/${day}`, `logs/${member}/${date}`];
}

/** Pure change planner for one legacy log directory. */
export async function planLogChanges(problems, existingFiles, root, updatedAt, interval = {}) {
  const existing = new Map((existingFiles || []).map((file) => [file.path, file.sha]));
  const desired = new Map();
  const used = new Set(problems.filter((problem) => Number.isInteger(problem.fileIndex) && problem.fileIndex >= 0).map((problem) => problem.fileIndex));
  let next = 0;
  for (const problem of problems) {
    if (!Number.isInteger(problem.fileIndex) || problem.fileIndex < 0) {
      while (used.has(next)) next += 1;
      problem.fileIndex = next;
      used.add(next);
      next += 1;
    }
  }
  desired.set(`${root}/meta.json`, JSON.stringify(metaFromProblems(problems, updatedAt, interval), null, 2));
  const keep = new Set();
  for (const problem of problems) {
    const prefix = `${root}/${problem.fileIndex}-`;
    desired.set(`${prefix}takeaway.md`, problem.takeaway || "未填写");
    if (problem.description) desired.set(`${prefix}desc.md`, problem.description);
    if (problem.code) desired.set(`${prefix}solution.cpp`, problem.code);
    if (problem.statementAttachment?.sha256) keep.add(statementPath(root, problem));
    for (const image of problem.statementImages || []) keep.add(statementImagePath(root, image));
  }
  const changes = [];
  for (const path of existing.keys()) if (!desired.has(path) && !keep.has(path)) changes.push({ path, delete: true });
  for (const [path, content] of desired) if (existing.get(path) !== await gitBlobSha(content)) changes.push({ path, content });
  return changes;
}

/** Pure projection from one saved day into the member's legacy training index. */
export function planLegacyIndexChange(user, date, problems, raw) {
  const memberId = user.memberId || user.login;
  let index;
  try { index = raw == null ? null : JSON.parse(raw); } catch { index = null; }
  if (index?.schemaVersion !== 1 || index.memberId !== memberId || index.member !== user.member || !Array.isArray(index.records)) {
    throw Object.assign(new Error("个人训练索引暂不可用"), { code: "INDEX_STALE", status: 503 });
  }
  const records = index.records.filter((record) => record?.date !== date);
  for (const problem of problems) {
    const recordRef = { memberId, date, recordId: problem.id };
    records.push({
      subjectKey: subjectKeyForProblem({ ...recordRef, ...problem }), date, recordRef,
      problem: catalogProblem(problem), ...normalizeLearningState(problem),
      ...(problem.reviewDue ? { reviewDue: problem.reviewDue } : {}),
      href: `/problem/${[user.member, date, problem.id].map(encodeURIComponent).join("/")}/`,
    });
  }
  records.sort((a, b) => a.date.localeCompare(b.date));
  const content = `${JSON.stringify({ ...index, records }, null, 2)}\n`;
  if (raw?.replace(/\r\n/g, "\n") === content) return null;
  return { path: trainingPaths(memberId).legacyIndex, content };
}
