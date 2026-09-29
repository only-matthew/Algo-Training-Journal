// Learning state is deliberately orthogonal: result, self-assessment, mistake
// flag, and review planning describe different facts and must not infer each other.
export const OUTCOMES = Object.freeze(["independent", "hinted", "editorial", "unfinished"]);
export const MASTERY_STATUSES = Object.freeze(["unknown", "learning", "mastered"]);
// Keep the pre-existing object-shaped public API: form/renderer callers use
// REVIEW_STATUSES.TODO. The allowed write values remain exactly these three.
export const REVIEW_STATUSES = Object.freeze({ NONE: "none", TODO: "todo", ARCHIVED: "archived" });
export const REVIEW_STATUS_VALUES = Object.freeze(Object.values(REVIEW_STATUSES));
export const MASTERY_STATUS_SOURCES = Object.freeze({ LEGACY_REVIEW_STATUS: "legacy_review_status", EXPLICIT_SELF_ASSESSMENT: "explicit_self_assessment" });

export const OUTCOME_LABELS = Object.freeze({ independent: "独立完成", hinted: "提示后完成", editorial: "看题解完成", unfinished: "未完成" });
export const MASTERY_LABELS = Object.freeze({ unknown: "尚未自评", learning: "仍在学习", mastered: "自评已掌握" });
export const REVIEW_LABELS = Object.freeze({ none: "未安排复习", todo: "待复习", archived: "已结束复习安排" });

const includes = (values, value) => values.includes(value);
export const normalizeOutcome = (value) => includes(OUTCOMES, value) ? value : undefined;
export const normalizeMasteryStatus = (value, legacyReviewStatus) => includes(MASTERY_STATUSES, value)
  ? value : legacyReviewStatus === "mastered" ? "mastered" : "unknown";
export const normalizeReviewStatus = (value) => includes(REVIEW_STATUS_VALUES, value) ? value : REVIEW_STATUSES.NONE;

export function normalizeLearningState(record = {}) {
  const legacyReviewStatus = record.reviewStatus;
  const hasExplicitMastery = ["learning", "mastered"].includes(record.masteryStatus);
  const masteryStatusSource = record.masteryStatusSource === MASTERY_STATUS_SOURCES.LEGACY_REVIEW_STATUS
    ? MASTERY_STATUS_SOURCES.LEGACY_REVIEW_STATUS
    : record.masteryStatusSource === MASTERY_STATUS_SOURCES.EXPLICIT_SELF_ASSESSMENT
      ? MASTERY_STATUS_SOURCES.EXPLICIT_SELF_ASSESSMENT
      : !hasExplicitMastery && legacyReviewStatus === "mastered"
        ? MASTERY_STATUS_SOURCES.LEGACY_REVIEW_STATUS
        : hasExplicitMastery
          ? MASTERY_STATUS_SOURCES.EXPLICIT_SELF_ASSESSMENT
          : undefined;
  return {
    ...(normalizeOutcome(record.outcome) ? { outcome: normalizeOutcome(record.outcome) } : {}),
    masteryStatus: normalizeMasteryStatus(record.masteryStatus, legacyReviewStatus),
    ...(masteryStatusSource ? { masteryStatusSource } : {}),
    isMistake: record.isMistake === true,
    reviewStatus: normalizeReviewStatus(legacyReviewStatus),
  };
}

export const isReviewPlanned = (record) => ["todo", "archived"].includes(normalizeLearningState(record).reviewStatus);
export const isReviewTodo = (record) => normalizeLearningState(record).reviewStatus === "todo";
