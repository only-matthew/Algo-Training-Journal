import assert from "node:assert/strict";
import test from "node:test";
import { addDaysToDate, resolveReviewPlan, reviewSuggestionApplies } from "../lib/review-suggestion.mjs";

test("失误、提示后完成、看题解完成和未完成会建议三天后复习", () => {
  const date = "2026-09-29";
  assert.equal(reviewSuggestionApplies({ isMistake: true }), true);
  for (const outcome of ["hinted", "editorial", "unfinished"]) {
    assert.equal(reviewSuggestionApplies({ outcome }), true);
    assert.deepEqual(resolveReviewPlan({ outcome, reviewStatus: "auto" }, date), { reviewStatus: "todo", reviewDue: "2026-10-02" });
  }
  assert.deepEqual(resolveReviewPlan({ isMistake: true, outcome: "independent", reviewStatus: "auto" }, date), { reviewStatus: "todo", reviewDue: "2026-10-02" });
});

test("无触发信号不安排；显式选择优先，日期按记录日跨月跨年计算", () => {
  assert.equal(addDaysToDate("2026-12-30", 3), "2027-01-02");
  assert.deepEqual(resolveReviewPlan({ outcome: "independent", reviewStatus: "auto" }, "2026-09-29"), { reviewStatus: "none" });
  assert.deepEqual(resolveReviewPlan({ outcome: "hinted", reviewStatus: "none" }, "2026-09-29"), { reviewStatus: "none" });
  assert.deepEqual(resolveReviewPlan({ outcome: "hinted", reviewStatus: "archived" }, "2026-09-29"), { reviewStatus: "archived" });
  assert.deepEqual(resolveReviewPlan({ outcome: "unfinished", reviewStatus: "deferred", reviewDue: "2026-10-05" }, "2026-09-29"), { reviewStatus: "deferred" });
  assert.deepEqual(resolveReviewPlan({ outcome: "hinted", reviewStatus: "todo", reviewDue: "2026-10-05" }, "2026-09-29"), { reviewStatus: "todo", reviewDue: "2026-10-05" });
  assert.deepEqual(resolveReviewPlan({ outcome: "hinted", reviewStatus: "auto", reviewDue: "2026-10-02", reviewDueGenerated: true }, "2026-12-30"), { reviewStatus: "todo", reviewDue: "2027-01-02" });
});

test("旧草稿的 auto 仍可解析，但新表单不再展示该选项", () => {
  assert.deepEqual(resolveReviewPlan({ outcome: "unfinished", reviewStatus: "auto" }, "2026-09-29"), { reviewStatus: "todo", reviewDue: "2026-10-02" });
});
