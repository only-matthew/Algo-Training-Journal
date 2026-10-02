const RECOMMENDED_OUTCOMES = new Set(["hinted", "editorial", "unfinished"]);

export function reviewSuggestionApplies({ isMistake, outcome } = {}) {
  return isMistake === true || RECOMMENDED_OUTCOMES.has(outcome);
}

export function addDaysToDate(date, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) return "";
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (value.getUTCFullYear() !== Number(match[1]) || value.getUTCMonth() !== Number(match[2]) - 1 || value.getUTCDate() !== Number(match[3])) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
