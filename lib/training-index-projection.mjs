// 个人训练索引（training/members/<id>/indexes/legacy.json）的记录投影。
//
// 同一份投影有两条生成路径：在线保存（Worker 的 planLegacyIndexChange）与离线重建
// （scripts/reindex-training.mjs）。过去两边各写一遍字段、href 编码与排序口径，一致性
// 只靠 CI 的 `training:reindex -- --check` 事后发现；任何一侧新增字段都会让另一侧
// 变成"过期数据"。这里把"一条训练记录 → 一条索引记录"与序列化口径收敛成唯一实现，
// 归并策略（在线按日期替换、离线全量重建）仍留在各自调用方，因为那是它们真正的差异。
//
// 背景见 docs/Audit/AUDIT-2026-10-02.md §4.1。

import { subjectKeyForProblem } from "./problem-identity.mjs";
import { catalogProblem } from "./recommendations.mjs";
import { normalizeLearningState } from "./learning-state.mjs";

/**
 * 一条当天训练记录 → 个人索引里的一条记录。
 *
 * @param {{ member: string, memberId: string, date: string, problem: object }} input
 */
export function projectLegacyIndexRecord({ member, memberId, date, problem }) {
  const recordRef = { memberId, date, recordId: problem.id };
  return {
    subjectKey: subjectKeyForProblem({ ...recordRef, ...problem }),
    date,
    recordRef,
    problem: catalogProblem(problem),
    ...normalizeLearningState(problem),
    ...(problem.reviewDue ? { reviewDue: problem.reviewDue } : {}),
    href: `/problem/${[member, date, problem.id].map(encodeURIComponent).join("/")}/`,
  };
}

/**
 * 索引文件的序列化口径：2 空格缩进 + 尾随换行。
 * 两条路径必须逐字节一致，`training:reindex -- --check` 就是按这个字节串比对的。
 */
export function serializeTrainingIndex(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
