// 日期加法统一来自 lib/date-string.mjs（纯 UTC 日历运算）。这里保持同名导出：
// lib/form.mjs 与 test/review-suggestion.test.mjs 都直接从这里引入。
import { addDaysToDate } from "./date-string.mjs";

export { addDaysToDate };

const RECOMMENDED_OUTCOMES = new Set(["hinted", "editorial", "unfinished"]);

export function reviewSuggestionApplies({ isMistake, outcome } = {}) {
  return isMistake === true || RECOMMENDED_OUTCOMES.has(outcome);
}

/** Resolve the form-only `auto` choice into persisted log fields. */
export function resolveReviewPlan(record, recordDate) {
  const status = record?.reviewStatus === "deferred" ? (record.reviewDue ? "todo" : "none") : record?.reviewStatus;
  const generatedDue = record?.reviewDueGenerated ? addDaysToDate(recordDate, 3) : "";
  // `auto` only exists in drafts created by the older form. New forms display
  // the resolved todo/none value directly.
  const explicit = status && status !== "auto";
  if (explicit) {
    return {
      reviewStatus: status,
      ...(status === "todo" && (generatedDue || record.reviewDue) ? { reviewDue: generatedDue || record.reviewDue } : {}),
    };
  }
  if (!reviewSuggestionApplies(record)) return { reviewStatus: "none" };
  return { reviewStatus: "todo", reviewDue: generatedDue || record?.reviewDue || addDaysToDate(recordDate, 3) };
}
