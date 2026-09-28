import assert from "node:assert/strict";
import test from "node:test";

import { applyReviewChanges, rememberReviewChange } from "../lib/review-overrides.mjs";

test("a successful review change survives stale generated data until it catches up", () => {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } });
  try {
    const record = { member: "廖夏", date: "2026-09-25", problemId: "p1", reviewStatus: "todo", reviewDue: "2026-09-28" };
    rememberReviewChange(record, { reviewStatus: "archived" });

    const stale = applyReviewChanges({ logs: [record], reviewQueue: [record], reviewQueueTotalDue: 1 });
    assert.equal(stale.logs[0].reviewStatus, "archived");
    assert.equal(stale.logs[0].reviewDue, undefined);
    assert.deepEqual(stale.reviewQueue, []);
    assert.equal(stale.reviewQueueTotalDue, 0);
    assert.equal(applyReviewChanges(record).reviewStatus, "archived");

    const updated = { ...record, reviewStatus: "archived", reviewDue: undefined };
    assert.deepEqual(applyReviewChanges(updated), updated);
    assert.equal(entries.size, 0, "the override is removed once generated data reflects the write");
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete globalThis.sessionStorage;
  }
});
