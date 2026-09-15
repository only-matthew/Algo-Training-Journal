import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACHMENT_MIME,
  MAX_ATTACHMENT_BYTES,
  MAX_NEW_ATTACHMENT_BYTES,
  attachmentRecordKey,
  createAttachmentStore,
  validateAttachmentFile,
} from "../lib/attachment-store.mjs";

/**
 * Minimal in-memory IndexedDB stand-in: the store only relies on open/upgrade,
 * one object store, and get/put/delete returning success events.
 */
function memoryIndexedDB({ failOpen = false } = {}) {
  const stores = new Map();
  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name) => { stores.set(name, new Map()); return {}; },
    transaction(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return {
        objectStore: () => ({
          get: (key) => request(map.get(key)),
          put: (value, key) => { map.set(key, value); return request(undefined); },
          delete: (key) => { map.delete(key); return request(undefined); },
        }),
      };
    },
  };
  return {
    map: stores,
    open() {
      const request = { result: db, error: null };
      queueMicrotask(() => {
        if (failOpen) { request.error = new Error("blocked"); request.onerror?.(); return; }
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

function request(result) {
  const req = { result, error: null };
  queueMicrotask(() => req.onsuccess?.());
  return req;
}

const pdf = () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], { type: ATTACHMENT_MIME });

test("attachmentRecordKey scopes records by member and date", () => {
  assert.notEqual(attachmentRecordKey("only-matthew", "2026-09-15"), attachmentRecordKey("wzzzzhhhhh", "2026-09-15"));
  assert.notEqual(attachmentRecordKey("only-matthew", "2026-09-15"), attachmentRecordKey("only-matthew", "2026-09-16"));
});

test("validateAttachmentFile enforces the same rules as the server", () => {
  assert.equal(validateAttachmentFile({ name: "题面.pdf", size: 10, type: ATTACHMENT_MIME }), null);
  // 扩展名、MIME、大小三者都要过：任一不符都会在保存时被服务端打回。
  assert.match(validateAttachmentFile({ name: "题面.png", size: 10, type: ATTACHMENT_MIME }), /只支持 PDF/);
  assert.match(validateAttachmentFile({ name: "题面.pdf", size: 10, type: "image/png" }), /不是 PDF/);
  assert.match(validateAttachmentFile({ name: "题面.pdf", size: 0, type: ATTACHMENT_MIME }), /为空/);
  assert.match(validateAttachmentFile({ name: "题面.pdf", size: MAX_ATTACHMENT_BYTES + 1, type: ATTACHMENT_MIME }), /不能超过/);
});

test("the store round-trips a chosen PDF for one date", async () => {
  const store = createAttachmentStore({ indexedDB: memoryIndexedDB() });
  const blob = pdf();
  assert.deepEqual(await store.loadDate("only-matthew", "2026-09-15"), { status: "missing", items: {} });

  assert.equal((await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "p1", blob, fileName: "题面.pdf", sha256: "a".repeat(64) })).status, "saved");

  const loaded = await store.loadDate("only-matthew", "2026-09-15");
  assert.equal(loaded.status, "found");
  assert.equal(loaded.items.p1.fileName, "题面.pdf");
  assert.equal(loaded.items.p1.bytes, blob.size);
  assert.equal(loaded.items.p1.blob.size, blob.size);

  // 同一天的第二题必须保留第一题，而不是覆盖整条记录。
  await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "p2", blob, fileName: "第二题.pdf", sha256: "b".repeat(64) });
  assert.deepEqual(Object.keys((await store.loadDate("only-matthew", "2026-09-15")).items).sort(), ["p1", "p2"]);

  await store.remove("only-matthew", "2026-09-15", "p1");
  assert.deepEqual(Object.keys((await store.loadDate("only-matthew", "2026-09-15")).items), ["p2"]);

  // 清空后记录本身也应删除，避免留下空壳。
  await store.clearDate("only-matthew", "2026-09-15");
  assert.deepEqual(await store.loadDate("only-matthew", "2026-09-15"), { status: "missing", items: {} });
});

test("attachments are isolated between members and dates", async () => {
  const store = createAttachmentStore({ indexedDB: memoryIndexedDB() });
  const blob = pdf();
  await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "p1", blob, fileName: "a.pdf", sha256: "a".repeat(64) });

  assert.equal((await store.loadDate("only-matthew", "2026-09-16")).status, "missing");
  assert.equal((await store.loadDate("wzzzzhhhhh", "2026-09-15")).status, "missing");
});

test("the store refuses a scope that is not a member id plus a real date", async () => {
  const store = createAttachmentStore({ indexedDB: memoryIndexedDB() });
  assert.equal((await store.loadDate("Only-Matthew", "2026-09-15")).status, "invalid_scope");
  assert.equal((await store.loadDate("only-matthew", "2026-02-30")).status, "invalid_scope");
  assert.equal((await store.save({ memberId: "only-matthew", date: "2026-13-01", problemId: "p1", blob: pdf(), fileName: "a.pdf", sha256: "a".repeat(64) })).status, "invalid_scope");
});

test("the per-save total is capped before it can be rejected by the server", async () => {
  // 用可注入的上限验证累加逻辑：真实上限是 10 MiB，这里不需要真的分配那么大的 blob。
  const store = createAttachmentStore({ indexedDB: memoryIndexedDB(), maxNewBytes: 10 });
  const blob = pdf(); // 8 字节
  assert.equal((await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "p1", blob, fileName: "a.pdf", sha256: "a".repeat(64) })).status, "saved");

  const overflow = await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "p2", blob, fileName: "b.pdf", sha256: "b".repeat(64) });
  assert.equal(overflow.status, "too_large");
  // 被拒绝时不能把这一条偷偷写进去。
  assert.deepEqual(Object.keys((await store.loadDate("only-matthew", "2026-09-15")).items), ["p1"]);
  assert.equal(MAX_NEW_ATTACHMENT_BYTES, 2 * MAX_ATTACHMENT_BYTES);
});

test("an unavailable backend degrades to no local restore instead of throwing", async () => {
  const store = createAttachmentStore({ indexedDB: memoryIndexedDB({ failOpen: true }) });
  assert.deepEqual(await store.loadDate("only-matthew", "2026-09-15"), { status: "missing", items: {} });
  assert.equal((await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "p1", blob: pdf(), fileName: "a.pdf", sha256: "a".repeat(64) })).status, "unavailable");

  // 完全没有 IndexedDB（旧浏览器 / 服务端渲染）同样不能抛。
  const bare = createAttachmentStore({ indexedDB: undefined });
  assert.deepEqual(await bare.loadDate("only-matthew", "2026-09-15"), { status: "missing", items: {} });
});

test("corrupt entries are dropped without discarding the valid ones", async () => {
  const idb = memoryIndexedDB();
  const store = createAttachmentStore({ indexedDB: idb });
  await store.save({ memberId: "only-matthew", date: "2026-09-15", problemId: "good", blob: pdf(), fileName: "a.pdf", sha256: "a".repeat(64) });
  // 直接往底层塞一条坏数据，模拟旧版本或被外部改写的记录。
  idb.map.get("pending").set(attachmentRecordKey("only-matthew", "2026-09-15"), {
    memberId: "only-matthew", date: "2026-09-15", items: { good: { blob: pdf(), fileName: "a.pdf", sha256: "a".repeat(64) }, bad: { fileName: "b.pdf" } },
  });

  const loaded = await store.loadDate("only-matthew", "2026-09-15");
  assert.deepEqual(Object.keys(loaded.items), ["good"]);
});
