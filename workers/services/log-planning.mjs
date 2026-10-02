import { metaFromProblems } from "../../lib/log-schema.mjs";
import { statementImagePath, statementPath } from "./logs-v2.mjs";
import { trainingPaths } from "./training.mjs";
import { assignFileIndexes, gitBlobSha, logRoots } from "./log-paths.mjs";
import { projectLegacyIndexRecord, serializeTrainingIndex } from "../../lib/training-index-projection.mjs";

// 保留原有导出名，`workers/storage/training-git.mjs` 等调用方无需改动。
export { gitBlobSha, logRoots };

/** Pure change planner for one legacy log directory. */
export async function planLogChanges(problems, existingFiles, root, updatedAt, interval = {}) {
  const existing = new Map((existingFiles || []).map((file) => [file.path, file.sha]));
  const desired = new Map();
  assignFileIndexes(problems);
  // 落盘口径必须与 logs-v2 的 textChanges 完全一致（含尾随换行）：否则在旧接口与 v2
  // 之间来回保存会不断产生"只差一个换行"的提交，并把客户端 revision 指纹打乱。
  desired.set(`${root}/meta.json`, `${JSON.stringify(metaFromProblems(problems, updatedAt, interval), null, 2)}\n`);
  const keep = new Set();
  for (const problem of problems) {
    const prefix = `${root}/${problem.fileIndex}-`;
    desired.set(`${prefix}takeaway.md`, problem.takeaway || "");
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
    records.push(projectLegacyIndexRecord({ member: user.member, memberId, date, problem }));
  }
  records.sort((a, b) => a.date.localeCompare(b.date));
  const content = serializeTrainingIndex({ ...index, records });
  if (raw?.replace(/\r\n/g, "\n") === content) return null;
  return { path: trainingPaths(memberId).legacyIndex, content };
}
