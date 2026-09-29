import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPeriodReport } from "../lib/period-report.mjs";

const options = { from: "2026-09-01", to: "2026-09-30", sourceCommit: "abc", sourceDataHash: "sha" };

test("period report deduplicates days, links later attempts by stable key, and marks missing data unknown", () => {
  const records = [
    { member: "甲", date: "2026-08-31", platform: "CodeForces", problemNumber: "123 A", reviewStatus: "todo", reviewDue: "2026-09-03", takeaway: "未填写" },
    { member: "甲", date: "2026-09-04", platform: "Codeforces", problemNumber: "123A", outcome: "independent", takeaway: "新思路" },
    { member: "甲", date: "2026-09-04", platform: "洛谷", problemNumber: "P1000", outcome: "hinted", takeaway: "" },
    { member: "乙", date: "2026-09-04", platform: "Codeforces", problemNumber: "123A", outcome: "independent", takeaway: "已理解" },
  ];
  const result = buildPeriodReport(records, { ...options, personalLists: { "甲": [{ platform: "Codeforces", problemNumber: "123A", name: "A" }] } });
  assert.equal(result.totals.members, 2);
  assert.equal(result.totals.recordDays, 2);
  assert.equal(result.totals.sessionsEstimated, 2);
  assert.equal(result.totals.problemRecords, 3);
  assert.equal(result.totals.uniqueProblemsWithStableKey, 2);
  assert.equal(result.totals.nonPlaceholderTakeaways, 2);
  assert.equal(result.totals.reviewsDue, 1);
  assert.equal(result.totals.reviewsWithRepeatEvidence, 1);
  assert.deepEqual(result.totals.personalChecklist, { membersWithList: 1, selected: 1, completed: 1 });
  assert.equal(result.unavailable.buttonClicks.startsWith("未知"), true);
  assert.deepEqual(buildPeriodReport(records, { ...options, personalLists: { "甲": [{ platform: "Codeforces", problemNumber: "123A", name: "A" }] } }), result);
});

test("same source and window produce byte-identical CLI reports", () => {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const command = () => spawnSync(process.execPath, ["scripts/period-report.mjs", "--from", "2026-09-01", "--to", "2026-09-29"], { cwd, encoding: "utf8" });
  const first = command();
  const second = command();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
});
