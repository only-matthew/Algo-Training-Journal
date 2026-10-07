import assert from "node:assert/strict";
import test from "node:test";

import { applyReviewChanges, rememberReviewChange, captureDateReviewChanges, synchronizeDateReviewChanges } from "../lib/review-overrides.mjs";
import { todayUtc8 } from "../lib/constants.mjs";

function mockStorage(context) {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index],
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete globalThis.sessionStorage;
  });
}

test("whole-date saves replace old overrides and do not overwrite newer quick actions", (context) => {
  mockStorage(context);
  const record = { member: "甲", date: "2026-10-06", problemId: "p1", reviewStatus: "archived" };
  rememberReviewChange(record, { reviewStatus: "archived" });
  const snapshot = captureDateReviewChanges(record.member, record.date);
  const saved = { ...record, reviewStatus: "todo", reviewDue: todayUtc8() };
  synchronizeDateReviewChanges([saved], [], snapshot);
  assert.equal(applyReviewChanges(record).reviewStatus, "todo");
  const nextSnapshot = captureDateReviewChanges(record.member, record.date);
  rememberReviewChange(record, { reviewStatus: "archived" });
  synchronizeDateReviewChanges([saved], [], nextSnapshot);
  assert.equal(applyReviewChanges(saved).reviewStatus, "archived");
});

test("date deletion removes cached summaries from stale queues and records", (context) => {
  mockStorage(context);
  const record = { member: "甲", date: "2026-10-06", problemId: "p1", reviewStatus: "todo", reviewDue: todayUtc8() };
  rememberReviewChange(record, record);
  synchronizeDateReviewChanges([], [record], captureDateReviewChanges(record.member, record.date));
  const stale = applyReviewChanges({ logs: [record], reviewQueue: [record], reviewQueueTotalDue: 1 });
  assert.deepEqual(stale.logs, []);
  assert.deepEqual(stale.reviewQueue, []);
  assert.equal(stale.reviewQueueTotalDue, 0);
});

test("replanning an old record adds it to an otherwise empty overview queue", (context) => {
  mockStorage(context);
  const record = { member: "甲", date: "2020-01-01", problemId: "old", reviewStatus: "archived", problem: "旧题" };
  rememberReviewChange(record, { reviewStatus: "todo", reviewDue: todayUtc8() });
  const result = applyReviewChanges({ logs: [], reviewQueue: [], reviewQueueTotalDue: 0 });
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.reviewQueue[0].problemId, "old");
  assert.equal(result.reviewQueueTotalDue, 1);
});

test("ending a future review does not reduce the count of today's due reviews", (context) => {
  mockStorage(context);
  const due = { member: "甲", date: "2020-01-01", problemId: "due", reviewStatus: "todo", reviewDue: todayUtc8() };
  const future = { ...due, problemId: "future", reviewDue: "9999-12-31" };
  rememberReviewChange(future, { reviewStatus: "archived" });
  const result = applyReviewChanges({ logs: [due, future], reviewQueue: [due, future], reviewQueueTotalDue: 1 });
  assert.deepEqual(result.reviewQueue.map((record) => record.problemId), ["due"]);
  assert.equal(result.reviewQueueTotalDue, 1);
});

test("caught-up logs cannot resurrect a stale queue entry while clearing the override", (context) => {
  mockStorage(context);
  const record = { member: "甲", date: "2020-01-01", problemId: "due", reviewStatus: "todo", reviewDue: todayUtc8() };
  rememberReviewChange(record, { reviewStatus: "archived" });
  const result = applyReviewChanges({ logs: [{ ...record, reviewStatus: "archived", reviewDue: undefined }], reviewQueue: [record] });
  assert.deepEqual(result.reviewQueue, []);
});

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
