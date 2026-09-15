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
