// 知识点掌握度规则（纯函数）。只解释已有训练证据，不使用 AI，也不写回原始日志。

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

// evidence 形如 buildNodeTrainingEvidence 的汇总项；referenceDate 使用 YYYY-MM-DD，
// 由构建端传入以保证构建产物和测试结果稳定。
export function assessMastery(evidence, referenceDate) {
  const total = Number(evidence?.totalRecords) || 0;
  const mastered = Number(evidence?.masteredRecords) || 0;
  const overdue = Array.isArray(evidence?.todoDueDates)
    ? evidence.todoDueDates.filter((due) => typeof due === "string" && due <= referenceDate).length
    : Number(evidence?.overdueReviewRecords) || 0;
  const lastTrainedAt = typeof evidence?.lastTrainedAt === "string" ? evidence.lastTrainedAt : "";
  const daysSinceTraining = lastTrainedAt ? daysBetween(lastTrainedAt, referenceDate) : null;

  if (total === 0) {
    return {
      state: "未接触",
      confidence: "无",
      reason: "暂无题单匹配或标签关联的训练记录",
      action: "从节点题单选择 1 道基础题开始",
      ...(daysSinceTraining != null ? { daysSinceTraining } : {}),
    };
  }
  if (overdue > 0) {
    return {
      state: "建议复习",
      confidence: "中",
      reason: `有 ${overdue} 条待复习记录已到期`,
      action: "优先完成到期复习题，再更新复盘状态",
      ...(daysSinceTraining != null ? { daysSinceTraining } : {}),
    };
  }
  if (daysSinceTraining != null && daysSinceTraining > 90) {
    return {
      state: "建议复习",
      confidence: "低",
      reason: `最近一次相关训练距今 ${daysSinceTraining} 天`,
      action: "完成 1 道巩固题，确认知识点仍可稳定运用",
      daysSinceTraining,
    };
  }
  if (total >= 5 && mastered > 0) {
    return {
      state: "较熟练",
      confidence: "高",
      reason: `已有 ${total} 条相关训练记录，其中 ${mastered} 条已掌握`,
      action: "可进入难度递进题，或继续巩固薄弱子主题",
      ...(daysSinceTraining != null ? { daysSinceTraining } : {}),
    };
  }
  if (total >= 3) {
    return {
      state: "有基础",
      confidence: "中",
      reason: `已有 ${total} 条相关训练记录`,
      action: "完成 1 道诊断或巩固题，确认边界与实现细节",
      ...(daysSinceTraining != null ? { daysSinceTraining } : {}),
    };
  }
  return {
    state: "已接触",
    confidence: "低",
    reason: `已有 ${total} 条相关训练记录，证据仍不足`,
    action: "再完成 2 道同专题题目以建立基础",
    ...(daysSinceTraining != null ? { daysSinceTraining } : {}),
  };
}
