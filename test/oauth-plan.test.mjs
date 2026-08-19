import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { gitBlobSha, planLogChanges, saveLog, readLog, deleteLog } from "../workers/oauth.mjs";
import { metaFromProblems } from "../lib/log-schema.mjs";

const gitSha = (content) => {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

const ROOT = "logs/廖夏/2026/08/11";
const UPDATED_AT = "2026-08-11T01:09:44.000+08:00";

const PROBLEMS = [
  {
    id: "p1",
    name: "最大子段和",
    platform: "洛谷",
    problemNumber: "P1115",
    difficulty: "普及-",
    tags: ["DP"],
    reviewStatus: "none",
    description: "给定数组求最大子段和。",
    takeaway: "经典 DP。",
    code: "int main(){}",
  },
  {
    id: "p2",
    name: "最短路径",
    platform: "Codeforces",
    problemNumber: "20C",
    difficulty: "提高",
    tags: ["最短路"],
    reviewStatus: "todo",
    description: "求单源最短路。",
    takeaway: "Dijkstra。",
    code: "// dijkstra",
  },
];

function existingFor(problems, updatedAt) {
  const files = [{ path: `${ROOT}/meta.json`, sha: gitSha(JSON.stringify(metaFromProblems(problems, updatedAt), null, 2)) }];
  problems.forEach((p, i) => {
    files.push({ path: `${ROOT}/${i}-takeaway.md`, sha: gitSha(p.takeaway || "未填写") });
    if (p.description) files.push({ path: `${ROOT}/${i}-desc.md`, sha: gitSha(p.description) });
    if (p.code) files.push({ path: `${ROOT}/${i}-solution.cpp`, sha: gitSha(p.code) });
  });
  return files;
}

test("gitBlobSha matches canonical git blob hashes", async () => {
  assert.equal(await gitBlobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  assert.equal(await gitBlobSha("hello world\n"), "3b18e512dba79e4c8300dd08aeb37f8e728b8dad");
  // UTF-8 内容与独立 node:crypto 实现一致
  const utf8 = "中文内容 abc\n😀";
  assert.equal(await gitBlobSha(utf8), gitSha(utf8));
});

test("planLogChanges creates all files for a brand-new day", async () => {
  const changes = await planLogChanges(PROBLEMS, null, ROOT, UPDATED_AT);
  assert.equal(changes.length, 1 + 3 * PROBLEMS.length);
  assert.ok(changes.every((change) => !change.delete));
  assert.ok(changes.some((change) => change.path === `${ROOT}/0-solution.cpp`));
});

test("planLogChanges skips every unchanged file when nothing changed", async () => {
  const changes = await planLogChanges(PROBLEMS, existingFor(PROBLEMS, UPDATED_AT), ROOT, UPDATED_AT);
  assert.deepEqual(changes, []);
});

test("planLogChanges rewrites meta.json when only updatedAt changed", async () => {
  const changes = await planLogChanges(PROBLEMS, existingFor(PROBLEMS, UPDATED_AT), ROOT, "2026-08-12T00:00:00.000+08:00");
  assert.deepEqual(changes, [{ path: `${ROOT}/meta.json`, content: JSON.stringify(metaFromProblems(PROBLEMS, "2026-08-12T00:00:00.000+08:00"), null, 2) }]);
});

test("planLogChanges only rewrites the file that actually changed", async () => {
  const edited = [{ ...PROBLEMS[0], takeaway: "换一种 DP 写法。" }, PROBLEMS[1]];
  const changes = await planLogChanges(edited, existingFor(PROBLEMS, UPDATED_AT), ROOT, UPDATED_AT);
  assert.deepEqual(changes, [{ path: `${ROOT}/0-takeaway.md`, content: "换一种 DP 写法。" }]);
});

test("planLogChanges deletes files of problems removed from the middle", async () => {
  const changes = await planLogChanges([PROBLEMS[0]], existingFor(PROBLEMS, UPDATED_AT), ROOT, UPDATED_AT);
  // meta.json 因 problems 列表变化而重写；被移除的第 2 题的三个文件删除
  assert.deepEqual(
    changes.map((change) => change.path).sort(),
    [`${ROOT}/meta.json`, `${ROOT}/1-desc.md`, `${ROOT}/1-solution.cpp`, `${ROOT}/1-takeaway.md`].sort(),
  );
  const deletes = changes.filter((change) => change.delete);
  assert.deepEqual(deletes.map((change) => change.path).sort(), [`${ROOT}/1-desc.md`, `${ROOT}/1-solution.cpp`, `${ROOT}/1-takeaway.md`].sort());
});

test("planLogChanges deletes the desc file when description is cleared", async () => {
  const cleared = [{ ...PROBLEMS[0], description: "" }, PROBLEMS[1]];
  const changes = await planLogChanges(cleared, existingFor(PROBLEMS, UPDATED_AT), ROOT, UPDATED_AT);
  assert.deepEqual(changes, [{ path: `${ROOT}/0-desc.md`, delete: true }]);
});

// ── 集成：mock GitHub API，验证 save → read → 增量 save → delete 全流程 ──

const API = "https://api.github.com/repos/only-matthew/Algo-Training-Journal";

function mockGitHub(state) {
  let blobPosts = 0;
  const shaToContent = new Map();
  const fetch = async (url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    const ok = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "4900" },
      });

    if (u.startsWith(`${API}/contents/`)) {
      const pathPart = decodeURIComponent(u.slice(`${API}/contents/`.length).split("?")[0]);
      const children = [...state.keys()].filter((p) => p.startsWith(pathPart + "/"));
      if (children.length) {
        return ok(children.map((p) => ({ type: "file", path: p, sha: gitSha(state.get(p)), size: state.get(p).length })));
      }
      const direct = state.get(pathPart);
      if (direct !== undefined) return ok({ content: Buffer.from(direct, "utf8").toString("base64"), encoding: "base64" });
      return new Response("Not Found", { status: 404 });
    }
    if (u === `${API}/git/ref/heads/main` && method === "GET") return ok({ object: { sha: "r0" } });
    if (u === `${API}/git/commits/r0` && method === "GET") return ok({ sha: "r0", tree: { sha: "t0" } });
    if (u === `${API}/git/blobs` && method === "POST") {
      blobPosts += 1;
      const body = JSON.parse(options.body);
      const sha = gitSha(body.content);
      shaToContent.set(sha, body.content);
      return ok({ sha });
    }
    if (u === `${API}/git/trees` && method === "POST") {
      for (const entry of JSON.parse(options.body).tree) {
        if (entry.sha === null) state.delete(entry.path);
        else if (shaToContent.has(entry.sha)) state.set(entry.path, shaToContent.get(entry.sha));
      }
      return ok({ sha: "t1" });
    }
    if (u === `${API}/git/commits` && method === "POST") return ok({ sha: "c1" });
    if (u === `${API}/git/refs/heads/main` && method === "PATCH") return ok({ sha: "c1" });
    throw new Error(`unexpected GitHub API call: ${method} ${u}`);
  };
  return { fetch, blobPosts: () => blobPosts };
}

const USER = { member: "廖夏", token: "test-token" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("saveLog → readLog round trip with incremental save and delete", async (context) => {
  const state = new Map();
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  await saveLog(USER, "2026-08-11", { problems: PROBLEMS });
  assert.equal(github.blobPosts(), 1 + 3 * PROBLEMS.length, "first save creates every blob");

  const read = await readLog(USER, "2026-08-11");
  assert.equal(read.problems.length, 2);
  assert.equal(read.problems[0].name, "最大子段和");
  assert.equal(read.problems[0].takeaway, "经典 DP。");
  assert.equal(read.problems[1].code, "// dijkstra");
  assert.ok(typeof read.updatedAt === "string");

  // 内容完全相同的二次保存：仅 meta.json（updatedAt 变化）需要写 blob
  await sleep(5);
  const blobsBefore = github.blobPosts();
  await saveLog(USER, "2026-08-11", { problems: PROBLEMS });
  assert.equal(github.blobPosts() - blobsBefore, 1, "unchanged content must not create blobs");

  // 只改一道题的 takeaway：增量写入该题文件
  const edited = [{ ...PROBLEMS[0], takeaway: "换一种 DP 写法。" }, PROBLEMS[1]];
  const before = github.blobPosts();
  await saveLog(USER, "2026-08-11", { problems: edited });
  assert.equal(github.blobPosts() - before, 2, "meta + one changed takeaway only");

  const afterEdit = await readLog(USER, "2026-08-11");
  assert.equal(afterEdit.problems[0].takeaway, "换一种 DP 写法。");
  assert.equal(afterEdit.problems[1].takeaway, "Dijkstra。");

  const deleted = await deleteLog(USER, "2026-08-11");
  assert.equal(deleted.deleted, true);
  assert.equal(state.size, 0, "all day files must be removed");
  assert.deepEqual(await readLog(USER, "2026-08-11"), { problems: [] });

  // 删除不存在的日期：返回 deleted:false，不产生任何 API 调用
  assert.deepEqual(await deleteLog(USER, "2026-08-12"), { deleted: false });
});

test("saveLog rejects invalid input without touching GitHub", async (context) => {
  const state = new Map();
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  await assert.rejects(saveLog(USER, "2026-08-11", { problems: [] }), /1 到 15 道题/);
  assert.equal(state.size, 0);
});
