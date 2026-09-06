import assert from "node:assert/strict";
import test from "node:test";

import { createDraftStore, draftStorageKey, MAX_DRAFT_BYTES, utf8ByteLength } from "../lib/draft-store.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("v2 drafts are isolated by account and date", () => {
  const store = createDraftStore({ storage: memoryStorage(), now: () => "2026-09-06T01:02:03.000Z" });
  const saved = store.save({ memberId: "alice", date: "2026-09-06", baseRevision: "r1", problems: [{ name: "汉" }] });

  assert.equal(saved.status, "saved");
  assert.deepEqual(store.load("alice", "2026-09-06").draft, saved.draft);
  assert.equal(store.load("bob", "2026-09-06").status, "missing");
  assert.equal(store.load("alice", "2026-09-07").status, "missing");
  assert.equal(draftStorageKey("alice", "2026-09-06"), "journal-drafts-v2:alice:2026-09-06");
});

test("a draft retains the existing-day marker needed to restore form mode", () => {
  const store = createDraftStore({ storage: memoryStorage(), now: () => "2026-09-06T01:02:03.000Z" });
  const saved = store.save({ memberId: "alice", date: "2026-09-06", exists: true, problems: [{ name: "A" }] });
  assert.equal(saved.status, "saved");
  assert.equal(store.load("alice", "2026-09-06").draft.exists, true);
});

test("load ignores malformed, mismatched, and legacy v1 data", () => {
  const storage = memoryStorage({
    "journal-drafts-v1": JSON.stringify({ "2026-09-06": { problems: [{ name: "legacy" }] } }),
    "journal-drafts-v2:alice:2026-09-06": JSON.stringify({ draftVersion: 2, memberId: "bob", date: "2026-09-06", baseRevision: null, problems: [], savedAt: "2026-09-06T00:00:00.000Z" }),
  });
  const store = createDraftStore({ storage });

  assert.equal(store.load("alice", "2026-09-06").status, "invalid_draft");
  assert.equal(storage.getItem("journal-drafts-v1") !== null, true);
});

test("limits use UTF-8 byte length for a single draft and all v2 drafts", () => {
  assert.equal(utf8ByteLength("汉"), 3);
  const storage = memoryStorage();
  const oneByteStore = createDraftStore({ storage, maxDraftBytes: 160, maxTotalBytes: 500, now: () => "2026-09-06T00:00:00.000Z" });
  assert.equal(oneByteStore.save({ memberId: "alice", date: "2026-09-06", problems: [{ text: "汉".repeat(40) }] }).status, "draft_too_large");

  const totalStore = createDraftStore({ storage, maxDraftBytes: MAX_DRAFT_BYTES, maxTotalBytes: 500, now: () => "2026-09-06T00:00:00.000Z" });
  assert.equal(totalStore.save({ memberId: "alice", date: "2026-09-06", problems: [{ text: "x".repeat(140) }] }).status, "saved");
  assert.equal(totalStore.save({ memberId: "alice", date: "2026-09-07", problems: [{ text: "x".repeat(140) }] }).status, "total_too_large");
});

test("a failed write preserves the previous draft", () => {
  const storage = memoryStorage();
  const store = createDraftStore({ storage, now: () => "2026-09-06T00:00:00.000Z" });
  const first = store.save({ memberId: "alice", date: "2026-09-06", problems: [{ name: "first" }] });
  storage.setItem = () => { throw new Error("quota"); };

  assert.equal(store.save({ memberId: "alice", date: "2026-09-06", problems: [{ name: "second" }] }).status, "unavailable");
  assert.deepEqual(store.load("alice", "2026-09-06").draft, first.draft);
});

test("conditional deletion cannot remove a newer draft", () => {
  const store = createDraftStore({ storage: memoryStorage(), now: () => "2026-09-06T00:00:00.000Z" });
  const first = store.save({ memberId: "alice", date: "2026-09-06", problems: [] });
  const second = store.save({ memberId: "alice", date: "2026-09-06", problems: [{ name: "new" }] });

  assert.notEqual(first.draft.savedAt, second.draft.savedAt);
  assert.equal(store.delete("alice", "2026-09-06", { expectedSavedAt: first.draft.savedAt }).status, "changed");
  assert.deepEqual(store.load("alice", "2026-09-06").draft, second.draft);
  assert.equal(store.delete("alice", "2026-09-06", { expectedSavedAt: second.draft.savedAt }).status, "deleted");
});
