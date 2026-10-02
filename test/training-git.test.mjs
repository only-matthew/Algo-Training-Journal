import assert from "node:assert/strict";
import test from "node:test";
import { trainingGit } from "../workers/storage/training-git.mjs";
import { gitBlobSha } from "../workers/services/log-paths.mjs";

test("日期条目直接取 tree SHA，目录列举共享缓存且不下载附件", async (context) => {
  const prefix = "logs/member/2026/10/02/";
  const sha = await gitBlobSha(new Uint8Array([0, 255, 1]));
  const entries = [
    { path: `${prefix}statement.pdf`, type: "blob", sha },
    { path: `${prefix}meta.json`, type: "blob", sha: "meta-sha" },
    { path: prefix, type: "tree", sha: "directory-sha" },
    { path: "logs/other/meta.json", type: "blob", sha: "other-sha" },
  ];
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    assert.match(String(url), /\/git\/trees\/head\?recursive=1$/);
    return new Response(JSON.stringify({ tree: entries }));
  });
  const git = trainingGit("token");
  const snapshot = { head: "head" };
  assert.deepEqual(await git.listFileEntries(snapshot, prefix), [
    { path: `${prefix}statement.pdf`, sha }, { path: `${prefix}meta.json`, sha: "meta-sha" },
  ]);
  assert.deepEqual(await git.listFiles(snapshot, prefix), [`${prefix}statement.pdf`, `${prefix}meta.json`]);
  assert.equal(calls.length, 1);
});

test("截断的 tree 不生成不完整日期版本", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ truncated: true, tree: [] })));
  await assert.rejects(() => trainingGit("token").listFileEntries({ head: "head" }, "logs/"), { code: "INDEX_STALE", status: 503 });
});
