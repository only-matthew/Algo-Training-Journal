import assert from "node:assert/strict";
import test from "node:test";

import { createLogsV2Service, parseLogsV2Request } from "../workers/services/logs-v2.mjs";

const MEMBER = "only-matthew";
const DISPLAY = "廖夏";
const OP = "4fd06885-a6ed-43b4-9ba6-ec8875638cdf";

async function blobSha(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const all = new Uint8Array(header.byteLength + bytes.byteLength); all.set(header); all.set(bytes, header.byteLength);
  const hash = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function gitMock() {
  let head = "head-0"; const files = new Map();
  return {
    files,
    async getHead() { return head; },
    async listFiles(_head, prefix) { return Promise.all([...files.entries()].filter(([path]) => path.startsWith(prefix)).map(async ([path, value]) => ({ path, sha: await blobSha(value) }))); },
    async readFile(_head, path) { const value = files.get(path); return value === undefined ? null : new TextDecoder().decode(value instanceof Uint8Array ? value : new TextEncoder().encode(value)); },
    async readBytes(_head, path) { const value = files.get(path); return value === undefined ? null : value instanceof Uint8Array ? value : new TextEncoder().encode(value); },
    async commit({ head: expected, changes }) { assert.equal(expected, head); for (const change of changes) { if (change.delete) files.delete(change.path); else files.set(change.path, change.binary || (change.encoding === "base64" ? Uint8Array.from(Buffer.from(change.content, "base64")) : change.content)); } head = `head-${Number(head.slice(5)) + 1}`; return { commitSha: head }; },
  };
}

test("v4 logs save PDF bytes, preserve keep references, and require current date version", async () => {
  const git = gitMock(); const service = createLogsV2Service({ git, now: () => "2026-09-15T00:00:00.000Z" });
  const pdf = new Uint8Array([...new TextEncoder().encode("%PDF-1.7\nbody")]);
  const pdfHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", pdf))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const saved = await service.save({ memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: OP, expectedVersion: null,
    log: { schemaVersion: 4, problems: [{ id: "p1", name: "A", statementAttachment: { pageRange: { from: 1, to: 2 } } }] },
    attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }], attachments: new Map([["pdf-1", { bytes: pdf, sha256: pdfHash, fileName: "a.pdf", mimeType: "application/pdf" }]]),
  });
  assert.match(saved.version, /^sha256:/);
  const read = await service.read({ member: DISPLAY, date: "2026-09-15" });
  assert.equal(read.version, saved.version);
  assert.equal(read.log.problems[0].statementAttachment.bytes, pdf.byteLength);
  const attachment = await service.statement({ member: DISPLAY, date: "2026-09-15", recordId: "p1" });
  assert.deepEqual(attachment.bytes, pdf);
  await assert.rejects(() => service.save({ memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: "5fd06885-a6ed-43b4-9ba6-ec8875638cdf", expectedVersion: null, log: read.log }), /reload/);
});

test("multipart parser rejects unreferenced PDFs and validates PDF bytes", async () => {
  const form = new FormData();
  form.set("payload", JSON.stringify({ operationId: OP, expectedVersion: null, log: { schemaVersion: 4, problems: [] }, attachmentChanges: [] }));
  form.set("orphan", new Blob(["%PDF-1.7"], { type: "application/pdf" }), "orphan.pdf");
  const parsed = await parseLogsV2Request(new Request("https://example.test", { method: "PUT", body: form }));
  assert.equal(parsed.attachments.get("orphan").bytes.byteLength, 8);
});

// ── 题面图片：分区按仓库文件名命名，内容哈希必须与文件名一致 ──

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
const OP_IMAGE = "6fd06885-a6ed-43b4-9ba6-ec8875638cdf";

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function imagePart(bytes, extension = "png") {
  const sha256 = await sha256Hex(bytes);
  return { fileName: `statement-${sha256}.${extension}`, sha256, bytes, mimeType: extension === "gif" ? "image/gif" : "image/png" };
}

function imageLogEntry(image) {
  return { sha256: image.sha256, fileName: image.fileName, bytes: image.bytes.byteLength, mimeType: image.mimeType };
}

test("题面图片与正文一起保存，可以读回，并在重新保存时沿用仓库里的文件", async () => {
  const git = gitMock(); const service = createLogsV2Service({ git, now: () => "2026-09-15T00:00:00.000Z" });
  const image = await imagePart(PNG, "png");
  const saved = await service.save({
    memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: OP_IMAGE, expectedVersion: null,
    log: { schemaVersion: 6, problems: [{ id: "p1", name: "A", description: `图：![示意图](./${image.fileName})`, statementImages: [imageLogEntry(image)] }] },
    images: new Map([[image.fileName, image]]),
  });
  assert.match(saved.version, /^sha256:/);
  // 文件名就是仓库路径：内容哈希 + 扩展名，题目槽位与它无关。
  assert.deepEqual(git.files.get(`logs/${DISPLAY}/2026/09/15/${image.fileName}`), PNG);
  const read = await service.read({ member: DISPLAY, date: "2026-09-15" });
  assert.deepEqual(read.log.problems[0].statementImages, [imageLogEntry(image)]);
  const fetched = await service.statementImage({ member: DISPLAY, date: "2026-09-15", recordId: "p1", fileName: image.fileName });
  assert.deepEqual(fetched.bytes, PNG);
  assert.equal(fetched.mimeType, "image/png");
  await assert.rejects(() => service.statementImage({ member: DISPLAY, date: "2026-09-15", recordId: "p2", fileName: image.fileName }), /not found/);

  // 再次保存：图片仍在正文里就不重新上传，文件照旧保留。
  const again = await service.save({
    memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: "7fd06885-a6ed-43b4-9ba6-ec8875638cdf", expectedVersion: read.version,
    log: { schemaVersion: 6, problems: [{ id: "p1", name: "A", description: read.log.problems[0].description, statementImages: [imageLogEntry(image)] }] },
  });
  assert.equal(git.files.has(`logs/${DISPLAY}/2026/09/15/${image.fileName}`), true);
  assert.match(again.version, /^sha256:/);
});

test("声明了图片却没有上传、也没有归档过时拒绝保存", async () => {
  const git = gitMock(); const service = createLogsV2Service({ git });
  const image = await imagePart(PNG, "png");
  await assert.rejects(() => service.save({
    memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: OP_IMAGE, expectedVersion: null,
    log: { schemaVersion: 6, problems: [{ id: "p1", name: "A", statementImages: [imageLogEntry(image)] }] },
  }), /not uploaded/i);
});

test("没有声明就不写入：多余的图片分区会被拒绝", async () => {
  const git = gitMock(); const service = createLogsV2Service({ git });
  const image = await imagePart(PNG, "png");
  await assert.rejects(() => service.save({
    memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: OP_IMAGE, expectedVersion: null,
    log: { schemaVersion: 6, problems: [{ id: "p1", name: "A" }] },
    images: new Map([[image.fileName, image]]),
  }), /not referenced/i);
});

test("描述里不再引用图片时删除仓库文件；不带字段的旧客户端则沿用旧引用", async () => {
  const git = gitMock(); const service = createLogsV2Service({ git, now: () => "2026-09-15T00:00:00.000Z" });
  const image = await imagePart(PNG, "png");
  await service.save({
    memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: OP_IMAGE, expectedVersion: null,
    log: { schemaVersion: 6, problems: [{ id: "p1", name: "A", description: `![图](${image.fileName})`, statementImages: [imageLogEntry(image)] }] },
    images: new Map([[image.fileName, image]]),
  });
  const path = `logs/${DISPLAY}/2026/09/15/${image.fileName}`;
  let read = await service.read({ member: DISPLAY, date: "2026-09-15" });

  // 旧客户端（不带 statementImages）不能把自己的无知当成删除指令。
  await service.save({ memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: "8fd06885-a6ed-43b4-9ba6-ec8875638cdf", expectedVersion: read.version, log: { schemaVersion: 5, problems: [{ id: "p1", name: "A", description: "只有文字" }] } });
  assert.equal(git.files.has(path), true);

  // 显式声明空集合才是「不再引用」：文件随之删除。
  read = await service.read({ member: DISPLAY, date: "2026-09-15" });
  await service.save({ memberId: MEMBER, member: DISPLAY, date: "2026-09-15", operationId: "9fd06885-a6ed-43b4-9ba6-ec8875638cdf", expectedVersion: read.version, log: { schemaVersion: 6, problems: [{ id: "p1", name: "A", description: "只有文字", statementImages: [] }] } });
  assert.equal(git.files.has(path), false);
  assert.equal((await service.read({ member: DISPLAY, date: "2026-09-15" })).log.problems[0].statementImages, undefined);
});

test("multipart 分区按文件名与内容校验题面图片", async () => {
  const build = (bytes, name) => {
    const form = new FormData();
    form.set("payload", JSON.stringify({ operationId: OP_IMAGE, expectedVersion: null, log: { schemaVersion: 6, problems: [] }, attachmentChanges: [] }));
    form.set(name, new Blob([bytes], { type: "image/png" }), name);
    return parseLogsV2Request(new Request("https://example.test", { method: "PUT", body: form }));
  };
  const image = await imagePart(PNG, "png");
  const parsed = await build(PNG, image.fileName);
  assert.equal(parsed.images.get(image.fileName).mimeType, "image/png");
  assert.deepEqual(parsed.images.get(image.fileName).bytes, PNG);

  // 文件名与内容哈希不符、扩展名与魔数不符都要打回；非约定命名的分区只能当 PDF 处理。
  await assert.rejects(() => build(GIF, image.fileName), /does not match its content|does not match its extension/);
  await assert.rejects(() => build(PNG, "statement-" + "a".repeat(64) + ".png"), /does not match its content/);
  await assert.rejects(() => build(PNG, "img-p1"), /not a PDF/);
});
