import assert from "node:assert/strict";
import test from "node:test";

import { planLegacyIndexChange } from "../workers/oauth.mjs";

const user = { login: "only-matthew", member: "廖夏" };

test("legacy read index is updated atomically with a saved or deleted daily log", () => {
  const raw = JSON.stringify({ schemaVersion: 1, memberId: user.login, member: user.member, records: [
    { date: "2026-09-05", subjectKey: "problem:洛谷|P1" },
    { date: "2026-09-06", subjectKey: "problem:洛谷|OLD" },
  ] });
  const saved = planLegacyIndexChange(user, "2026-09-06", [{
    id: "p-new", name: "A+B", platform: "洛谷", problemNumber: "P1001", difficulty: "入门", tags: [], reviewStatus: "todo", reviewDue: "2026-09-09",
  }], raw);
  assert.equal(saved.path, "training/members/only-matthew/indexes/legacy.json");
  const savedIndex = JSON.parse(saved.content);
  assert.deepEqual(savedIndex.records.map((item) => item.date), ["2026-09-05", "2026-09-06"]);
  assert.equal(savedIndex.records[1].subjectKey, "problem:洛谷|P1001");
  assert.equal(savedIndex.records[1].reviewDue, "2026-09-09");

  const deleted = JSON.parse(planLegacyIndexChange(user, "2026-09-06", [], saved.content).content);
  assert.deepEqual(deleted.records.map((item) => item.date), ["2026-09-05"]);
});
