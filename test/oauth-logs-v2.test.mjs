// Worker-level coverage for the /api/v2/logs routes.
//
// These tests exercise the real HTTP entry point (workers/oauth.mjs) against a
// GitHub mock that models the Git Data API faithfully enough for binary
// attachment round-trips: blob encoding, tree entries with type/path, and the
// recursive tree listing the date-version fingerprint depends on.
import assert from "node:assert/strict";
import test from "node:test";

import worker, { seal } from "../workers/oauth.mjs";

const API = "https://api.github.com/repos/only-matthew/Algo-Training-Journal";
const SECRET = "test-session-secret";
const LOGIN = "only-matthew";
const MEMBER = "廖夏";
const CSRF = "csrf-logs-v2";
const OP = "4fd06885-a6ed-43b4-9ba6-ec8875638cdf";
const DATE = "2026-09-15";
const LEGACY_INDEX = `training/members/${LOGIN}/indexes/legacy.json`;

const encoder = new TextEncoder();

async function gitBlobSha(bytes) {
  const header = encoder.encode(`blob ${bytes.byteLength}\0`);
  const all = new Uint8Array(header.byteLength + bytes.byteLength);
  all.set(header); all.set(bytes, header.byteLength);
  const hash = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBytes(value) {
  return value instanceof Uint8Array ? value : encoder.encode(String(value));
}

function githubMock() {
  let head = "r0";
  let commitNumber = 0;
  let treeNumber = 0;
  let blobNumber = 0;
  let fetchCount = 0;
  let currentTree = "tree-r0";
  // A commit points at an immutable tree, so repository contents must be resolved
  // through "commit -> tree -> blobs" rather than one mutable map: the date-version
  // fingerprint of a fresh snapshot reads the tree at the head commit.
  const committed = new Map();          // path -> bytes at the current head
  const blobStore = new Map();          // git blob sha -> bytes
  const treeContents = new Map([["tree-r0", new Map()]]);
  const commitTrees = new Map([["r0", "tree-r0"]]);
  const response = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "4900" },
  });
  const contentsAt = (treeSha) => treeContents.get(treeSha) || new Map();

  return {
    files: committed,
    get fetchCount() { return fetchCount; },
    get commits() { return commitNumber; },
    setFile(path, value) {
      const bytes = toBytes(value);
      committed.set(path, bytes);
      contentsAt(currentTree).set(path, bytes);
    },
    unsetFile(path) { committed.delete(path); contentsAt(currentTree).delete(path); },
    async fetch(input, options = {}) {
      fetchCount += 1;
      const url = String(input);
      const method = options.method || "GET";
      if (!url.startsWith(API)) throw new Error(`unexpected fetch ${method} ${url}`);
      const path = decodeURIComponent(url.slice(`${API}/`.length).split("?")[0]);

      if (path === "git/ref/heads/main" && method === "GET") return response({ object: { sha: head } });
      if (/^git\/commits\/[^/]+$/.test(path) && method === "GET") {
        const sha = path.slice("git/commits/".length);
        return response({ tree: { sha: commitTrees.get(sha) || currentTree } });
      }
      if (path === "git/blobs" && method === "POST") {
        const body = JSON.parse(options.body);
        const bytes = body.encoding === "base64" ? Uint8Array.from(atob(body.content), (char) => char.charCodeAt(0)) : encoder.encode(body.content);
        // GitHub returns the content-addressable blob SHA, and the tree API later
        // takes those SHAs back. The mock must key blobs by the same real SHA the
        // adapter computes locally, or the tree silently drops every entry.
        const sha = `blob-${blobNumber}`;
        blobNumber += 1;
        blobStore.set(sha, bytes);
        return response({ sha });
      }
      if (path === "git/trees" && method === "POST") {
        const request = JSON.parse(options.body);
        const next = new Map(contentsAt(request.base_tree));
        for (const entry of request.tree) {
          // A null sha is Git's deletion marker; the real API removes that path.
          if (entry.sha === null) next.delete(entry.path);
          else next.set(entry.path, blobStore.get(entry.sha));
        }
        treeNumber += 1;
        currentTree = `tree-${treeNumber}`;
        treeContents.set(currentTree, next);
        return response({ sha: currentTree });
      }
      if (path === "git/commits" && method === "POST") {
        commitNumber += 1;
        const sha = `commit-${commitNumber}`;
        commitTrees.set(sha, currentTree);
        return response({ sha });
      }
      if (path === "git/refs/heads/main" && method === "PATCH") {
        const body = JSON.parse(options.body);
        assert.equal(body.force, false, "the v2 log routes must never force-push");
        head = body.sha;
        committed.clear();
        for (const [filePath, value] of contentsAt(commitTrees.get(head) || currentTree)) committed.set(filePath, value);
        return response({ object: { sha: head } });
      }
      if (/^git\/trees\/[^/]+$/.test(path) && method === "GET") {
        const treeSha = path.slice("git/trees/".length);
        const resolved = treeContents.has(treeSha) ? treeSha : commitTrees.get(treeSha) || currentTree;
        const tree = [...contentsAt(resolved).keys()].map((entryPath) => ({ path: entryPath, type: "blob", mode: "100644" }));
        return response({ tree, truncated: false });
      }
      if (path.startsWith("contents/")) {
        const target = path.slice("contents/".length);
        const files = contentsAt(currentTree);
        // The legacy /api/logs/date adapter lists directories through the Contents
        // API, so the mock must answer prefix lookups with an array of real blob
        // SHAs — that is what makes the two write paths agree on a date version.
        const children = [...files.keys()].filter((entry) => entry.startsWith(`${target}/`));
        if (children.length) {
          const listing = [];
          for (const child of children.sort()) {
            const bytes = files.get(child);
            listing.push({ type: "file", path: child, sha: await gitBlobSha(bytes), size: bytes.byteLength });
          }
          return response(listing);
        }
        const value = files.get(target);
        if (value === undefined) return response({ message: "Not Found" }, 404);
        return response({
          type: "file",
          path: target,
          sha: await gitBlobSha(value),
          size: value.byteLength,
          content: Buffer.from(value).toString("base64"),
          encoding: "base64",
        });
      }
      throw new Error(`unexpected GitHub call ${method} ${path}`);
    },
  };
}

function sessionCookie() {
  return seal({ token: "token", login: LOGIN, member: MEMBER, csrfToken: CSRF, exp: Date.now() + 600000 }, SECRET);
}

async function call(github, path, init) {
  const response = await worker.fetch(new Request(`https://train.xialiao.org${path}`, {
    ...init,
    headers: { Cookie: `__Host-journal_session=${await sessionCookie()}`, ...(init?.headers || {}) },
  }), { SESSION_SECRET: SECRET });
  if (response.status === 401) {
    throw new Error(`unexpected 401 for ${init?.method || "GET"} ${path}: ${await response.clone().text()}`);
  }
  return response;
}

function pdfPart() {
  return new Uint8Array([...encoder.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n")]);
}

// Every member already has an index in the repository; the save path deliberately
// fails closed (INDEX_STALE) when it is absent, so the fixtures seed a valid one.
function seedLegacyIndex(github, records = []) {
  github.setFile(LEGACY_INDEX, `${JSON.stringify({ schemaVersion: 1, memberId: LOGIN, member: MEMBER, records }, null, 2)}\n`);
}

function multipartBody({ log, operationId = OP, expectedVersion = null, attachmentChanges, partName = "pdf-1", bytes = pdfPart() }) {
  const form = new FormData();
  form.set("payload", JSON.stringify({ operationId, expectedVersion, log, attachmentChanges }));
  form.set(partName, new Blob([bytes], { type: "application/pdf" }), "statement.pdf");
  return form;
}

function pdfLog(extra = {}) {
  return {
    schemaVersion: 4,
    problems: [{ id: "p1", name: "Loop", platform: "Codeforces", problemNumber: "123A", tags: [], ...extra }],
  };
}

function jsonCall(github, path, method, body, operationId) {
  return call(github, path, {
    method,
    headers: {
      "X-CSRF-Token": CSRF,
      "Content-Type": "application/json",
      // Every mutation needs its own key; reusing one would be an idempotency
      // conflict rather than the version conflict under test.
      "Idempotency-Key": operationId || crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}

const OP_IMAGES = "6fd06885-a6ed-43b4-9ba6-ec8875638cdf";

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22, 0x33, 0x44]);
}

async function sha256Hex(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

test("v2 logs PUT archives crawled statement images and serves them back", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const bytes = pngBytes();
  const sha256 = await sha256Hex(bytes);
  const fileName = `statement-${sha256}.png`;
  const image = { sha256, fileName, bytes: bytes.byteLength, mimeType: "image/png" };
  const log = {
    schemaVersion: 6,
    problems: [{ id: "p1", name: "Loop", platform: "Codeforces", problemNumber: "123A", tags: [], description: `图：![示意图](./${fileName})`, statementImages: [image] }],
  };
  const form = new FormData();
  form.set("payload", JSON.stringify({ operationId: OP_IMAGES, expectedVersion: null, log }));
  form.set(fileName, new Blob([bytes], { type: "image/png" }), fileName);

  const saved = await call(github, `/api/v2/logs/dates/${DATE}`, { method: "PUT", headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP_IMAGES }, body: form });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.match(body.version, /^sha256:[a-f0-9]{64}$/);

  const meta = JSON.parse(new TextDecoder().decode(github.files.get(`logs/${MEMBER}/2026/09/15/meta.json`)));
  assert.deepEqual(meta.problems[0].statementImages, [image]);
  // 图片文件名就是仓库路径，不带题目槽位：内容相同的图片在同一天只落一份。
  assert.deepEqual(github.files.get(`logs/${MEMBER}/2026/09/15/${fileName}`), bytes);

  const served = await call(github, `/api/v2/logs/dates/${DATE}/problems/p1/images/${fileName}`, { method: "GET" });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Content-Type"), "image/png");
  assert.equal(served.headers.get("Content-Disposition"), "inline");
  assert.equal(served.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), bytes);

  // 未登记的文件名与别题的引用都不能被读到。
  const other = `statement-${"a".repeat(64)}.png`;
  assert.equal((await call(github, `/api/v2/logs/dates/${DATE}/problems/p1/images/${other}`, { method: "GET" })).status, 404);
  assert.equal((await call(github, `/api/v2/logs/dates/${DATE}/problems/p2/images/${fileName}`, { method: "GET" })).status, 404);
});

test("v2 logs PUT rejects an image part whose bytes do not match its name", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const bytes = pngBytes();
  const fileName = `statement-${"b".repeat(64)}.png`;
  const form = new FormData();
  form.set("payload", JSON.stringify({ operationId: OP_IMAGES, expectedVersion: null, log: { schemaVersion: 6, problems: [{ id: "p1", name: "Loop" }] } }));
  form.set(fileName, new Blob([bytes], { type: "image/png" }), fileName);
  const response = await call(github, `/api/v2/logs/dates/${DATE}`, { method: "PUT", headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP_IMAGES }, body: form });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_IMAGE");
});

test("v2 logs PUT rejects a missing idempotency key before touching Git", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const response = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify({ log: pdfLog(), expectedVersion: null }),
  });
  assert.equal(response.status, 428);
  assert.equal((await response.json()).error.code, "PRECONDITION_REQUIRED");
  assert.equal(github.fetchCount, 0);
});

test("v2 logs PUT stores a PDF with its hash and reports a date version", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const bytes = pdfPart();

  const saved = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }], bytes }),
  });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.match(body.version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(body.publicationStatus, "pending");
  assert.equal(saved.headers.get("ETag"), `"${body.version}"`);

  // The stored meta must reference the real bytes, not client-supplied values.
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const meta = JSON.parse(new TextDecoder().decode(github.files.get(`logs/${MEMBER}/2026/09/15/meta.json`)));
  assert.deepEqual(meta.problems[0].statementAttachment, { sha256, fileName: "statement.pdf", bytes: bytes.byteLength, mimeType: "application/pdf" });
  assert.equal(meta.problems[0].fileIndex, 0);
  assert.ok(github.files.has(`logs/${MEMBER}/2026/09/15/0-statement-${sha256}.pdf`));

  const read = await call(github, `/api/v2/logs/dates/${DATE}`, { method: "GET" });
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.version, body.version);
  assert.equal(readBody.problems[0].statementAttachment.sha256, sha256);
});

test("v2 logs GET returns the statement bytes with attachment-safe headers", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const bytes = pdfPart();
  await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }], bytes }),
  });

  const statement = await call(github, `/api/v2/logs/dates/${DATE}/problems/p1/statement`, { method: "GET" });
  assert.equal(statement.status, 200);
  assert.equal(statement.headers.get("Content-Type"), "application/pdf");
  assert.equal(statement.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(statement.headers.get("Content-Disposition"), /^attachment; filename\*=UTF-8''statement\.pdf$/);
  assert.deepEqual(new Uint8Array(await statement.arrayBuffer()), bytes);

  const missing = await call(github, `/api/v2/logs/dates/${DATE}/problems/nope/statement`, { method: "GET" });
  assert.equal(missing.status, 404);
});

test("v2 logs PUT rejects a stale expected version instead of overwriting", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const first = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }] }),
  });
  assert.equal(first.status, 200);

  const stale = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": "5fd06885-a6ed-43b4-9ba6-ec8875638cdf" },
    body: multipartBody({ log: pdfLog({ name: "Overwritten" }), attachmentChanges: [], expectedVersion: null, partName: undefined }),
  });
  assert.equal(stale.status, 409);
  const body = await stale.json();
  assert.equal(body.error.code, "VERSION_CONFLICT");
  assert.match(body.error.currentRevision, /^sha256:/);
});

test("v2 logs PUT replays one idempotency key without committing twice", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const init = {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }] }),
  };
  const first = await call(github, `/api/v2/logs/dates/${DATE}`, init);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(github.commits, 1);
  const before = github.files.get(`logs/${MEMBER}/2026/09/15/meta.json`);

  // A retried request must use a fresh multipart body (streams are single-use).
  const replay = await call(github, `/api/v2/logs/dates/${DATE}`, {
    ...init,
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }] }),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).version, firstBody.version);
  assert.deepEqual(github.files.get(`logs/${MEMBER}/2026/09/15/meta.json`), before);
  assert.equal(github.commits, 1, "replaying one idempotency key must not commit a second time");
});

test("v2 logs DELETE requires the current version and removes the day", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const saved = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }] }),
  });
  const version = (await saved.json()).version;

  const wrong = await jsonCall(github, `/api/v2/logs/dates/${DATE}`, "DELETE", { expectedVersion: null });
  assert.equal(wrong.status, 409);

  const removed = await jsonCall(github, `/api/v2/logs/dates/${DATE}`, "DELETE", { expectedVersion: version });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).deleted, true);
  assert.equal([...github.files.keys()].some((path) => path.startsWith(`logs/${MEMBER}/2026/09/15/`)), false);
});

test("v2 logs keeps the personal training index in the same commit", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);

  const saved = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }] }),
  });
  assert.equal(saved.status, 200);

  const index = JSON.parse(new TextDecoder().decode(github.files.get(LEGACY_INDEX)));
  assert.equal(index.records.length, 1);
  assert.equal(index.records[0].subjectKey, "problem:Codeforces|123A");
  assert.deepEqual(index.records[0].recordRef, { memberId: LOGIN, date: DATE, recordId: "p1" });
});

test("v2 logs fails closed when the personal training index is missing", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  const response = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({ log: pdfLog(), attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }] }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "INDEX_STALE");
  assert.equal(github.commits, 0, "a rejected save must not leave a partial commit");
});

// 关键跨路径不变量：表单平时用旧接口读写，只有上传 PDF 时才切到 v2。
// 如果两条路径对「同一天的版本」算法不一致，用户一挂附件就会撞上幻影冲突。
test("a date version from the legacy endpoint is accepted by the v2 attachment save", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);

  // 1. 旧接口创建这一天（表单的日常路径）。
  const legacy = await call(github, `/api/logs/date?date=${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedVersion: null,
      problems: [{ id: "p1", name: "Loop", platform: "Codeforces", problemNumber: "123A", tags: [], takeaway: "第一次提交。" }],
    }),
  });
  assert.equal(legacy.status, 200, await legacy.clone().text());
  const legacyRevision = (await legacy.json()).revision;

  // 2. 旧接口读取出来的版本必须与 v2 读取一致。
  const legacyRead = await (await call(github, `/api/logs/date?date=${DATE}`)).json();
  assert.equal(legacyRead.revision, legacyRevision);
  const v2Read = await (await call(github, `/api/v2/logs/dates/${DATE}`)).json();
  assert.equal(v2Read.revision, legacyRevision, "both read paths must agree on the date version");

  // 3. 用旧接口给的版本走 v2 上传 PDF：不能被当成过期版本。
  const saved = await call(github, `/api/v2/logs/dates/${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Idempotency-Key": OP },
    body: multipartBody({
      log: { schemaVersion: 4, problems: [{ id: "p1", name: "Loop", platform: "Codeforces", problemNumber: "123A", tags: [], takeaway: "第一次提交。" }] },
      expectedVersion: legacyRevision,
      attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-1" }],
    }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const savedBody = await saved.json();
  assert.equal(savedBody.revision, savedBody.version);

  // 4. 保存返回的版本必须能被下一次旧接口读取复现。
  const afterAttach = await (await call(github, `/api/logs/date?date=${DATE}`)).json();
  assert.equal(afterAttach.revision, savedBody.revision, "the legacy read must agree with the v2 save revision");
  assert.equal(afterAttach.problems[0].statementAttachment.sha256, savedBody.log.problems[0].statementAttachment.sha256);

  // 5. 挂上附件之后，旧接口原样回传该引用仍可保存（不能把自己锁死）。
  const again = await call(github, `/api/logs/date?date=${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: afterAttach.revision, problems: afterAttach.problems }),
  });
  assert.equal(again.status, 200, await again.clone().text());
});

// ── 单题复习命令：PATCH /api/v2/me/logs/dates/:date/records/:id ──
//
// 这条路由取代了「读整天 → 改一题 → 写整天」。服务端在同一请求内自己读取当前
// 版本再写回，所以客户端不提供 revision，版本冲突由服务端检测而不是由客户端猜。

const RECORD_ROOT = `logs/${MEMBER}/2026/09/15`;

function twoProblems() {
  return [
    { id: "p1", name: "Loop", platform: "Codeforces", problemNumber: "123A", tags: [], takeaway: "第一次提交。" },
    { id: "p2", name: "Watermelon", platform: "Codeforces", problemNumber: "4A", tags: [], takeaway: "第二题。" },
  ];
}

function seedDay(github, { problems, startedOn, solvedOn }) {
  return call(github, `/api/logs/date?date=${DATE}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: null, ...(startedOn ? { startedOn } : {}), ...(solvedOn ? { solvedOn } : {}), problems }),
  });
}

function patchCall(github, recordId, patch) {
  return call(github, `/api/v2/me/logs/dates/${DATE}/records/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function storedMeta(github) {
  return JSON.parse(new TextDecoder().decode(github.files.get(`${RECORD_ROOT}/meta.json`)));
}

test("单题复习 PATCH 只改目标记录，保留同日其他题与当天区间", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  const seeded = await seedDay(github, { problems: twoProblems(), startedOn: "2026-09-13", solvedOn: "2026-09-15" });
  assert.equal(seeded.status, 200, await seeded.clone().text());

  const response = await patchCall(github, "p1", { reviewStatus: "archived" });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.record.id, "p1");
  assert.equal(body.record.reviewStatus, "archived");
  assert.match(body.revision, /^sha256:[a-f0-9]{64}$/);

  const meta = storedMeta(github);
  const first = meta.problems.find((problem) => problem.id === "p1");
  const second = meta.problems.find((problem) => problem.id === "p2");
  assert.equal(first.reviewStatus, "archived");
  assert.equal(first.reviewDue, undefined, "结束复习安排必须清掉到期日");
  assert.equal(second.reviewStatus, "none", "同一天的另一题不能被改动");
  assert.equal(second.masteryStatus, "unknown");
  assert.equal(meta.startedOn, "2026-09-13", "整天保存会带上当前区间，单题命令不得丢掉它");
  assert.equal(meta.solvedOn, "2026-09-15");
  assert.equal(meta.problems.length, 2);
  // 文件槽位必须稳定：正文不能被重排或删除。
  assert.ok(github.files.has(`${RECORD_ROOT}/0-takeaway.md`));
  assert.ok(github.files.has(`${RECORD_ROOT}/1-takeaway.md`));
});

test("单题复习 PATCH 的顺延命令写入新的到期日", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  await seedDay(github, { problems: twoProblems() });

  const response = await patchCall(github, "p2", { reviewStatus: "todo", reviewDue: "2026-09-18" });
  assert.equal(response.status, 200, await response.clone().text());
  const meta = storedMeta(github);
  assert.equal(meta.problems.find((problem) => problem.id === "p2").reviewStatus, "todo");
  assert.equal(meta.problems.find((problem) => problem.id === "p2").reviewDue, "2026-09-18");
  assert.equal(meta.problems.find((problem) => problem.id === "p1").reviewStatus, "none");
});

test("单题复习 PATCH 拒绝白名单外的字段、非法状态与非法日期", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  await seedDay(github, { problems: twoProblems() });
  const before = await call(github, `/api/v2/logs/dates/${DATE}`, { method: "GET" });

  // 只允许复习字段：不能让这条命令变成「顺手改题目或正文」的后门。
  const extra = await patchCall(github, "p1", { reviewStatus: "archived", name: "Renamed" });
  assert.equal(extra.status, 400);
  assert.equal((await extra.json()).error.code, "MALFORMED_REQUEST");

  const invalidState = await patchCall(github, "p1", { reviewStatus: "mastered" });
  assert.equal(invalidState.status, 422);
  assert.equal((await invalidState.json()).error.code, "VALIDATION_FAILED");

  const invalidDate = await patchCall(github, "p1", { reviewStatus: "todo", reviewDue: "2026/09/18" });
  assert.equal(invalidDate.status, 422);
  assert.equal((await invalidDate.json()).error.code, "VALIDATION_FAILED");

  // 被拒绝的请求不能改动仓库内容。
  const after = await call(github, `/api/v2/logs/dates/${DATE}`, { method: "GET" });
  assert.equal((await after.json()).revision, (await before.json()).revision);
});

test("单题复习 PATCH 对不存在的记录返回 404 且不改动仓库", async (context) => {
  const github = githubMock();
  seedLegacyIndex(github);
  context.mock.method(globalThis, "fetch", github.fetch);
  await seedDay(github, { problems: twoProblems() });
  const commitsBefore = github.commits;

  const missing = await patchCall(github, "nope", { reviewStatus: "archived" });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
  assert.equal(github.commits, commitsBefore, "找不到记录时不得产生提交");
});
