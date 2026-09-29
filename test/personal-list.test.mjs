import assert from "node:assert/strict";
import test from "node:test";
import { personalListProgress, validatePersonalList } from "../lib/personal-list.mjs";

test("personal list has a clear denominator and counts only finished evidence for matching subjects", () => {
  const items = validatePersonalList([
    { platform: "CodeForces", problemNumber: "123 A", name: "A" },
    { platform: "洛谷", problemNumber: "P1000", name: "入门" },
  ]);
  const progress = personalListProgress(items, [
    { platform: "Codeforces", problemNumber: "123A", date: "2026-09-01", outcome: "unfinished", member: "甲" },
    { platform: "Codeforces", problemNumber: "123A", date: "2026-09-02", outcome: "hinted", member: "甲" },
    { platform: "洛谷", problemNumber: "P1000", date: "2026-09-03", member: "甲" },
  ]);
  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.entries[0].evidence.date, "2026-09-02");
  assert.equal(progress.entries[1].evidence, null);
  assert.throws(() => validatePersonalList([items[0], items[0]]), /重复/);
});
