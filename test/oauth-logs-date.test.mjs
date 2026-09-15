// Worker-level coverage for the legacy /api/logs/date endpoint.
//
// This is the entry point the shipped browser form actually calls, so its
// conditional-write contract is verified over real HTTP rather than by calling
// the service functions directly. The GitHub mock models the Contents API the
// way the adapter uses it: a directory prefix yields an array of files whose
// `sha` is the real git blob hash, and an exact path yields base64 content.
import assert from "node:assert/strict";
import test from "node:test";

import worker, { gitBlobSha, seal } from "../workers/oauth.mjs";

const API = "https://api.github.com/repos/only-matthew/Algo-Training-Journal";
const SECRET = "test-session-secret";
const LOGIN = "only-matthew";
const MEMBER = "廖夏";
const CSRF = "csrf-logs-date";
const DATE = "2026-08-11";
const ROOT = `logs/${MEMBER}/2026/08/11`;
const LEGACY_INDEX = `training/members/${LOGIN}/indexes/legacy.json`;

const encoder = new TextEncoder();

const EMPTY_INDEX = `${JSON.stringify({ schemaVersion: 1, memberId: LOGIN, member: MEMBER, records: [] }, null, 2)}\n`;

const PROBLEMS = [
  { id: "p-1", problem: "最大子段和", name: "最大子段和", platform: "Codeforces", problemNumber: "1000A", difficulty: "★ 1200", difficultyRating: 1200, tags: "dp", reviewStatus: "未复习", description: "求最大连续和", takeaway: "经典 DP。", code: "// kadane" },
  { id: "p-2", problem: "最短路", name: "最短路", platform: "Luogu", problemNumber: "P3376", difficulty: "★ 1500", difficultyRating: 1500, tags: "graph", reviewStatus: "未复习", description: "单源最短路", takeaway: "Dijkstra。", code: "// dijkstra" },
];

function githubMock() {
  let head = "r0";
  let commitNumber = 0;
  let treeNumber = 0;
  let blobNumber = 0;
  let currentTree = "tree-r0";
  const treeContents = new Map([["tree-r0", new Map()]]);
  const commitTrees = new Map([["r0", "tree-r0"]]);
  const blobStore = new Map();

  const contentsAt = (treeSha) => treeContents.get(treeSha) || new Map();
  const response = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "4900" },
  });

  return {
    get commits() { return commitNumber; },
    /** Files visible at the current head, as `path -> bytes`. */
    get snapshot() { return new Map(contentsAt(currentTree)); },
    /** Writes a file into the initial snapshot before the first commit. */
    seed(path, value) {
      const bytes = typeof value === "string" ? encoder.encode(value) : value;
      contentsAt(currentTree).set(path, bytes);
    },
    async fileText(path) {
      const bytes = contentsAt(currentTree).get(path);
      return bytes === undefined ? null : new TextDecoder().decode(bytes);
    },
    async fetch(input, options = {}) {
      const url = String(input);
      const method = options.method || "GET";
      if (!url.startsWith(API)) throw new Error(`unexpected fetch ${method} ${url}`);
      const path = decodeURIComponent(url.slice(`${API}/`.length).split("?")[0]);

      if (path === "git/ref/heads/main" && method === "GET") return response({ object: { sha: head } });
      if (/^git\/commits\/[^/]+$/.test(path) && method === "GET") {
        return response({ tree: { sha: commitTrees.get(path.slice("git/commits/".length)) || currentTree } });
      }
      if (path.startsWith("contents/")) {
        const target = path.slice("contents/".length);
        const files = contentsAt(currentTree);
        // A prefix lookup must answer with an array; the adapter's listDir treats a
        // non-array (or 404) as "this directory does not exist".
        const children = [...files.keys()].filter((entry) => entry.startsWith(`${target}/`));
        if (children.length) {
          const listing = [];
          for (const child of children.sort()) {
            const bytes = files.get(child);
            listing.push({ type: "file", path: child, sha: await gitBlobSha(bytes), size: bytes.byteLength });
          }
          return response(listing);
        }
        const exact = files.get(target);
        if (exact === undefined) return response({ message: "Not Found" }, 404);
        return response({
          type: "file",
          path: target,
          sha: await gitBlobSha(exact),
          size: exact.byteLength,
          content: Buffer.from(exact).toString("base64"),
          encoding: "base64",
        });
      }
      if (path === "git/blobs" && method === "POST") {
        const body = JSON.parse(options.body);
        const bytes = body.encoding === "base64"
          ? Uint8Array.from(atob(body.content), (char) => char.charCodeAt(0))
          : encoder.encode(body.content);
        const sha = `blob-${blobNumber}`;
        blobNumber += 1;
        blobStore.set(sha, bytes);
        return response({ sha });
      }
      if (path === "git/trees" && method === "POST") {
        const request = JSON.parse(options.body);
        const next = new Map(contentsAt(request.base_tree));
        for (const entry of request.tree) {
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
        head = sha;
        return response({ sha });
      }
      if (path === "git/refs/heads/main" && method === "PATCH") {
        assert.equal(JSON.parse(options.body).force, false, "the log routes must never force-push");
        return response({ object: { sha: head } });
      }
      throw new Error(`unexpected GitHub call ${method} ${path}`);
    },
  };
}

function cookie() {
  return seal({ token: "token", login: LOGIN, member: MEMBER, csrfToken: CSRF, exp: Date.now() + 600000 }, SECRET);
}

async function call(github, method, body, extraHeaders = {}) {
  const init = {
    method,
    headers: { Cookie: `__Host-journal_session=${await cookie()}`, ...extraHeaders },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  return worker.fetch(new Request(`https://train.xialiao.org/api/logs/date?date=${DATE}`, init), {
    SESSION_SECRET: SECRET,
    GITHUB_MOCK: github,
  });
}

/** Every write reconciles the personal training index, so it must exist first. */
function seedIndex(github) {
  github.seed(LEGACY_INDEX, EMPTY_INDEX);
}

test("legacy PUT without a version is refused with 428 and writes nothing", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  seedIndex(github);

  const response = await call(github, "PUT", { problems: PROBLEMS }, { "X-CSRF-Token": CSRF });
  assert.equal(response.status, 428);
  const body = await response.json();
  assert.equal(body.code, "PRECONDITION_REQUIRED");
  assert.equal(github.commits, 0, "a refused conditional write must not commit");
});

test("legacy conditional write round trip: create, read version, update, conflict, delete", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  seedIndex(github);

  // 尚不存在的日期：revision 为 null。
  const empty = await call(github, "GET");
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { problems: [], revision: null });

  // 首次创建必须显式回传 null。
  const created = await call(github, "PUT", { problems: PROBLEMS, expectedVersion: null }, { "X-CSRF-Token": CSRF });
  assert.equal(created.status, 200);
  assert.equal(github.commits, 1);
  const createdBody = await created.json();
  assert.match(createdBody.revision, /^sha256:[a-f0-9]{64}$/);

  const read = await call(github, "GET");
  const loaded = await read.json();
  assert.equal(loaded.problems.length, 2);
  assert.equal(loaded.problems[0].takeaway, "经典 DP。");
  assert.equal(loaded.problems[1].code, "// dijkstra");
  assert.match(loaded.revision, /^sha256:[a-f0-9]{64}$/);
  // 保存返回的版本必须与随后读取算出的版本一致，否则用户每保存一次都会撞上幻影冲突。
  assert.equal(createdBody.revision, loaded.revision, "the save revision must equal the next read revision");

  // 用错误版本（null，即认为该日期不存在）覆盖必须 409，并给出当前版本。
  const stale = await call(github, "PUT", { problems: PROBLEMS.slice(0, 1), expectedVersion: null }, { "X-CSRF-Token": CSRF });
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.code, "VERSION_CONFLICT");
  assert.equal(conflict.currentRevision, loaded.revision);
  assert.equal(github.commits, 1, "the conflicting save must not commit");

  // 版本格式非法：422，而不是被当成一个合法版本去比较。
  const malformed = await call(github, "PUT", { problems: PROBLEMS, expectedVersion: "nope" }, { "X-CSRF-Token": CSRF });
  assert.equal(malformed.status, 422);
  assert.equal((await malformed.json()).code, "VALIDATION_FAILED");

  // 正确版本：更新成功，且版本随之变化。
  const edited = [{ ...PROBLEMS[0], takeaway: "换一种 DP 写法。" }, PROBLEMS[1]];
  const updated = await call(github, "PUT", { problems: edited, expectedVersion: loaded.revision }, { "X-CSRF-Token": CSRF });
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  const afterEdit = await (await call(github, "GET")).json();
  assert.equal(afterEdit.problems[0].takeaway, "换一种 DP 写法。");
  assert.notEqual(afterEdit.revision, loaded.revision, "the revision must change after a write");
  assert.equal(updatedBody.revision, afterEdit.revision, "the save revision must equal the next read revision");

  // 连续保存不需要重新加载页面：上一次保存返回的版本可以直接用于下一次写入。
  const secondEdit = [{ ...PROBLEMS[0], takeaway: "再改一次。" }, PROBLEMS[1]];
  const secondSave = await call(github, "PUT", { problems: secondEdit, expectedVersion: updatedBody.revision }, { "X-CSRF-Token": CSRF });
  assert.equal(secondSave.status, 200, await secondSave.clone().text());
  const finalState = await (await call(github, "GET")).json();
  assert.equal(finalState.problems[0].takeaway, "再改一次。");
  assert.equal((await secondSave.json()).revision, finalState.revision);

  // DELETE 同样必须带版本。
  const noVersion = await call(github, "DELETE", undefined, { "X-CSRF-Token": CSRF });
  assert.equal(noVersion.status, 428);

  const deleted = await call(github, "DELETE", { expectedVersion: finalState.revision }, { "X-CSRF-Token": CSRF });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).deleted, true);
  const gone = await (await call(github, "GET")).json();
  assert.deepEqual(gone, { problems: [], revision: null });
});

test("legacy writes refuse to introduce an attachment reference they cannot upload", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  seedIndex(github);

  await call(github, "PUT", { problems: PROBLEMS, expectedVersion: null }, { "X-CSRF-Token": CSRF });
  const loaded = await (await call(github, "GET")).json();

  // 旧接口没有上传 PDF 字节的能力：写入一个新引用会得到指向不存在文件的记录。
  const attachment = { sha256: "d".repeat(64), fileName: "题面.pdf", bytes: 999, mimeType: "application/pdf" };
  const withAttachment = [{ ...PROBLEMS[0], statementAttachment: attachment }, PROBLEMS[1]];
  const attached = await call(github, "PUT", { problems: withAttachment, expectedVersion: loaded.revision }, { "X-CSRF-Token": CSRF });
  assert.equal(attached.status, 422);
  assert.equal((await attached.json()).code, "ATTACHMENT_REQUIRES_V2");

  // 原样回传已有引用（表单编辑既有记录的做法）不受影响。
  await call(github, "PUT", { problems: withAttachment.map((p) => ({ ...p, statementAttachment: undefined })), expectedVersion: loaded.revision }, { "X-CSRF-Token": CSRF });
  const current = await (await call(github, "GET")).json();
  const unchanged = await call(github, "PUT", { problems: PROBLEMS, expectedVersion: current.revision }, { "X-CSRF-Token": CSRF });
  assert.equal(unchanged.status, 200, await unchanged.clone().text());
});

test("legacy writes reject a future date before touching GitHub", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  seedIndex(github);

  const response = await worker.fetch(new Request("https://train.xialiao.org/api/logs/date?date=2099-01-01", {
    method: "PUT",
    headers: { Cookie: `__Host-journal_session=${await cookie()}`, "X-CSRF-Token": CSRF, "Content-Type": "application/json" },
    body: JSON.stringify({ problems: PROBLEMS, expectedVersion: null }),
  }), { SESSION_SECRET: SECRET });
  assert.equal(response.status, 400);
  assert.equal(github.commits, 0);
});

test("legacy writes without a CSRF token are rejected", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  seedIndex(github);

  const response = await call(github, "PUT", { problems: PROBLEMS, expectedVersion: null });
  assert.equal(response.status, 403);
  assert.equal(github.commits, 0);
});

test("an If-Match header is accepted as the version source", async (context) => {
  const github = githubMock();
  context.mock.method(globalThis, "fetch", github.fetch);
  seedIndex(github);

  await call(github, "PUT", { problems: PROBLEMS, expectedVersion: null }, { "X-CSRF-Token": CSRF });
  const loaded = await (await call(github, "GET")).json();

  // 带引号的实体标签是 HTTP 的标准形式。
  const viaHeader = await call(github, "PUT", { problems: PROBLEMS }, { "X-CSRF-Token": CSRF, "If-Match": `"${loaded.revision}"` });
  assert.equal(viaHeader.status, 200, await viaHeader.clone().text());
});
