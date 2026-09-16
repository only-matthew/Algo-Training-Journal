import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { gitBlobSha, planLogChanges, saveLog, readLog, deleteLog, assertLogVersionPlan } from "../workers/oauth.mjs";
import { metaFromProblems } from "../lib/log-schema.mjs";

const gitSha = (content) => {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

const ROOT = "logs/廖夏/2026/08/11";
const LEGACY_INDEX = "training/members/only-matthew/indexes/legacy.json";
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

test("planLogChanges keeps a referenced statement PDF instead of deleting it", async () => {
  const attachment = { sha256: "b".repeat(64), fileName: "题面.pdf", bytes: 1234, mimeType: "application/pdf" };
  const problems = [{ ...PROBLEMS[0], fileIndex: 0, statementAttachment: attachment }, { ...PROBLEMS[1], fileIndex: 1 }];
  const pdfPath = `${ROOT}/0-statement-${attachment.sha256}.pdf`;
  const existing = [...existingFor(problems, UPDATED_AT), { path: pdfPath, sha: "c".repeat(40) }];

  const changes = await planLogChanges(problems, existing, ROOT, UPDATED_AT);

  // 附件字节由 v2 接口写入，旧接口只负责保留它：既不能删掉，也不该重复创建。
  assert.ok(!changes.some((change) => change.path === pdfPath), "the referenced PDF must survive a legacy save");
});

test("planLogChanges deletes a statement PDF that is no longer referenced", async () => {
  const attachment = { sha256: "b".repeat(64), fileName: "题面.pdf", bytes: 1234, mimeType: "application/pdf" };
  const withAttachment = [{ ...PROBLEMS[0], fileIndex: 0, statementAttachment: attachment }, { ...PROBLEMS[1], fileIndex: 1 }];
  const pdfPath = `${ROOT}/0-statement-${attachment.sha256}.pdf`;
  const existing = [...existingFor(withAttachment, UPDATED_AT), { path: pdfPath, sha: "c".repeat(40) }];

  // 用户移除了附件引用：孤立的 PDF 应该被清理，而不是永远留在仓库里。
  const detached = [{ ...PROBLEMS[0], fileIndex: 0 }, { ...PROBLEMS[1], fileIndex: 1 }];
  const changes = await planLogChanges(detached, existing, ROOT, UPDATED_AT);

  const removal = changes.find((change) => change.path === pdfPath);
  assert.ok(removal, "an unreferenced PDF should be cleaned up");
  assert.equal(removal.delete, true);
});

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

test("planLogChanges preserves file slots when problems are reordered", async () => {
  const original = PROBLEMS.map((p, i) => ({ ...p, fileIndex: i }));
  const reordered = [original[1], original[0]];
  const changes = await planLogChanges(reordered, existingFor(original, UPDATED_AT), ROOT, UPDATED_AT);
  assert.deepEqual(changes.map((change) => change.path), [`${ROOT}/meta.json`]);
  assert.equal(reordered[0].fileIndex, 1);
  assert.equal(reordered[1].fileIndex, 0);
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

const USER = { login: "only-matthew", member: "廖夏", token: "test-token" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("legacy /api/logs/date is conditional: missing version is rejected, stale version conflicts", async (context) => {
  const state = new Map([[LEGACY_INDEX, `${JSON.stringify({ schemaVersion: 1, memberId: USER.login, member: USER.member, records: [] }, null, 2)}\n`]]);
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  // 首次创建必须显式声明「该日期尚不存在」，不能靠缺省值蒙混。
  await assert.rejects(
    () => saveLog(USER, "2026-08-11", { problems: PROBLEMS }),
    (error) => error.code === "PRECONDITION_REQUIRED" && error.status === 428,
  );
  assert.equal(state.size, 1, "a rejected save must not write anything");

  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null);
  const created = await readLog(USER, "2026-08-11");
  assert.match(created.revision, /^sha256:[a-f0-9]{64}$/);

  // 用过期版本（null = 认为该日期不存在）再写一次必须 409，且带上当前版本。
  await assert.rejects(
    () => saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null),
    (error) => error.code === "VERSION_CONFLICT" && error.status === 409 && error.currentRevision === created.revision,
  );
  // 版本格式不对直接 422，而不是当成合法版本去比较。
  await assert.rejects(
    () => saveLog(USER, "2026-08-11", { problems: PROBLEMS }, "nope"),
    (error) => error.code === "VALIDATION_FAILED" && error.status === 422,
  );

  const before = github.blobPosts();
  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, created.revision);
  assert.ok(github.blobPosts() >= before, "matching version proceeds to commit");

  const current = await readLog(USER, "2026-08-11");
  assert.notEqual(current.revision, created.revision, "the revision must change after a write");

  // DELETE 同样必须带版本。
  await assert.rejects(
    () => deleteLog(USER, "2026-08-11"),
    (error) => error.code === "PRECONDITION_REQUIRED" && error.status === 428,
  );
  assert.equal((await deleteLog(USER, "2026-08-11", current.revision)).deleted, true);
  assert.deepEqual(await readLog(USER, "2026-08-11"), { problems: [], revision: null });
});

test("saveLog → readLog round trip with incremental save, index sync and delete", async (context) => {
  const state = new Map([[LEGACY_INDEX, `${JSON.stringify({ schemaVersion: 1, memberId: USER.login, member: USER.member, records: [] }, null, 2)}\n`]]);
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null);
  assert.equal(github.blobPosts(), 2 + 3 * PROBLEMS.length, "first save creates every log blob and the read index");
  assert.equal(JSON.parse(state.get(LEGACY_INDEX)).records.length, 2);

  const read = await readLog(USER, "2026-08-11");
  assert.equal(read.problems.length, 2);
  assert.equal(read.problems[0].name, "最大子段和");
  assert.equal(read.problems[0].takeaway, "经典 DP。");
  assert.equal(read.problems[1].code, "// dijkstra");
  assert.ok(typeof read.updatedAt === "string");
  assert.match(read.revision, /^sha256:/);

  // 内容完全相同的二次保存：仅 meta.json（updatedAt 变化）需要写 blob
  await sleep(5);
  const blobsBefore = github.blobPosts();
  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, read.revision);
  assert.equal(github.blobPosts() - blobsBefore, 1, "unchanged content must not create blobs");

  // 只改一道题的 takeaway：增量写入该题文件
  const edited = [{ ...PROBLEMS[0], takeaway: "换一种 DP 写法。" }, PROBLEMS[1]];
  const before = github.blobPosts();
  const second = await readLog(USER, "2026-08-11");
  await saveLog(USER, "2026-08-11", { problems: edited }, second.revision);
  assert.equal(github.blobPosts() - before, 2, "meta + one changed takeaway only");

  const afterEdit = await readLog(USER, "2026-08-11");
  assert.equal(afterEdit.problems[0].takeaway, "换一种 DP 写法。");
  assert.equal(afterEdit.problems[1].takeaway, "Dijkstra。");

  const deleted = await deleteLog(USER, "2026-08-11", afterEdit.revision);
  assert.equal(deleted.deleted, true);
  assert.equal(state.size, 1, "all day files are removed while the empty read index remains");
  assert.deepEqual(JSON.parse(state.get(LEGACY_INDEX)).records, []);
  assert.deepEqual(await readLog(USER, "2026-08-11"), { problems: [], revision: null });

  // 删除不存在的日期：返回 deleted:false，不产生任何 API 调用
  assert.deepEqual(await deleteLog(USER, "2026-08-12", null), { deleted: false });
});

test("the date revision ignores files outside the date directory", async (context) => {
  const index = { schemaVersion: 1, memberId: USER.login, member: USER.member, records: [] };
  const state = new Map([[LEGACY_INDEX, `${JSON.stringify(index, null, 2)}\n`]]);
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null);
  const first = await readLog(USER, "2026-08-11");

  // 直接改写个人索引（模拟另一条记录的保存）：日期版本不应因此变化，
  // 否则每次编辑别的一天都会让这一天变成「冲突」。
  state.set(LEGACY_INDEX, `${JSON.stringify({ ...index, records: [{ date: "2026-01-01" }] }, null, 2)}\n`);
  const second = await readLog(USER, "2026-08-11");
  assert.equal(second.revision, first.revision, "the index is not part of the date version");
});

test("a save whose planned changes escape the date directory is refused", async (context) => {
  const state = new Map([[LEGACY_INDEX, `${JSON.stringify({ schemaVersion: 1, memberId: USER.login, member: USER.member, records: [] }, null, 2)}\n`]]);
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null);
  const read = await readLog(USER, "2026-08-11");

  // 正常路径：同一版本重复保存只改本日期目录内的文件，必须成功。
  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, read.revision);

  // 越界检测直接单测：把一条目录外变更混进计划。边界守卫在版本比较之前执行，
  // 因此即使版本本身不匹配也必须先拒掉越界写入。
  const outside = [{ path: "logs/廖夏/2026-08-12/meta.json", content: "{}" }];
  const inside = await planLogChanges(PROBLEMS, null, ROOT, UPDATED_AT);
  assert.ok(inside.every((change) => change.path.startsWith(`${ROOT}/`)), "planLogChanges stays inside the date root");
  await assert.rejects(
    () => assertLogVersionPlan({ expectedVersion: null, changes: outside, root: ROOT }),
    (error) => error.code === "INTERNAL_ERROR" && error.status === 500,
  );
});

test("saveLog rejects invalid input without touching GitHub", async (context) => {
  const state = new Map();
  const github = mockGitHub(state);
  context.mock.method(globalThis, "fetch", github.fetch);

  await assert.rejects(saveLog(USER, "2026-08-11", { problems: [] }), /1 到 15 道题/);
  assert.equal(state.size, 0);
});

// ── 并发写入：ref 冲突重试不能拿旧快照算出的内容覆盖别人的改动 ──

/**
 * 忠实一点的 Git Data API 替身：commit → tree → blob，ref 用 force:false 更新。
 * 它按 commit sha 保存快照，因此能区分「读的是哪个 head」，也能在第一次 ref 更新前
 * 插入一次「别人先提交成功」的并发写入（真实世界里这就是我们拿到 422 的原因）。
 */
function concurrentGitHub(files) {
  let counter = 0;
  const commits = new Map();
  const trees = new Map();
  const blobs = new Map();
  const contentsReads = [];
  const snapshotOf = (sha) => commits.get(sha)?.snapshot || trees.get(sha) || null;
  const stage = (snapshot) => {
    counter += 1;
    const sha = `tree-${counter}`;
    trees.set(sha, new Map(snapshot));
    return sha;
  };
  const record = (treeSha, snapshot) => {
    counter += 1;
    const sha = `commit-${counter}`;
    commits.set(sha, { treeSha, snapshot: new Map(snapshot) });
    return sha;
  };

  let head = record(stage(files), files);
  const ok = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "4900" } });

  const github = {
    contentsReads,
    head: () => head,
    index: () => JSON.parse(snapshotOf(head).get(LEGACY_INDEX)),
    // 模拟另一个请求成功提交：以当前 head 为父提交推进 ref。
    externalCommit(mutate) {
      const snapshot = new Map(snapshotOf(head));
      mutate(snapshot);
      head = record(stage(snapshot), snapshot);
      return head;
    },
    // 第一次 ref 更新前触发；返回新的 head 表示「别人先提交成功」，我们应当收到 422。
    onRefPatch: null,
    async fetch(url, options = {}) {
      const u = String(url);
      const method = options.method || "GET";
      if (u.startsWith(`${API}/contents/`)) {
        const requested = decodeURIComponent(new URL(u).searchParams.get("ref") || head);
        // 真实 GitHub 会把分支名解析成当前 head；显式 sha 则精确读取那个提交。
        const ref = requested === "main" ? head : requested;
        contentsReads.push(ref);
        const snapshot = snapshotOf(ref);
        if (!snapshot) return new Response("Not Found", { status: 404 });
        const pathPart = decodeURIComponent(u.slice(`${API}/contents/`.length).split("?")[0]);
        const children = [...snapshot.keys()].filter((p) => p.startsWith(pathPart + "/"));
        if (children.length) return ok(children.map((p) => ({ type: "file", path: p, sha: gitSha(snapshot.get(p)), size: snapshot.get(p).length })));
        const direct = snapshot.get(pathPart);
        if (direct !== undefined) return ok({ content: Buffer.from(direct, "utf8").toString("base64"), encoding: "base64" });
        return new Response("Not Found", { status: 404 });
      }
      if (u === `${API}/git/ref/heads/main` && method === "GET") return ok({ object: { sha: head } });
      if (/\/git\/commits\/[^/]+$/.test(u) && method === "GET") {
        const sha = u.split("/").pop();
        const entry = commits.get(sha);
        if (!entry) return new Response("Not Found", { status: 404 });
        return ok({ sha, tree: { sha: entry.treeSha } });
      }
      if (u === `${API}/git/blobs` && method === "POST") {
        const body = JSON.parse(options.body);
        const sha = gitSha(body.content);
        blobs.set(sha, body.content);
        return ok({ sha });
      }
      if (u === `${API}/git/trees` && method === "POST") {
        const body = JSON.parse(options.body);
        const next = new Map(snapshotOf(body.base_tree) || []);
        for (const entry of body.tree) {
          if (entry.sha === null) next.delete(entry.path);
          else next.set(entry.path, blobs.get(entry.sha));
        }
        return ok({ sha: stage(next) });
      }
      if (u === `${API}/git/commits` && method === "POST") {
        const body = JSON.parse(options.body);
        counter += 1;
        const sha = `commit-${counter}`;
        commits.set(sha, { treeSha: body.tree, snapshot: new Map(trees.get(body.tree)) });
        return ok({ sha });
      }
      if (u === `${API}/git/refs/heads/main` && method === "PATCH") {
        const advanced = github.onRefPatch?.();
        if (advanced) return new Response(JSON.stringify({ message: "Reference update failed" }), { status: 422 });
        head = JSON.parse(options.body).sha;
        return ok({ sha: head });
      }
      throw new Error(`unexpected GitHub API call: ${method} ${u}`);
    },
  };
  return github;
}

const emptyIndex = () => `${JSON.stringify({ schemaVersion: 1, memberId: USER.login, member: USER.member, records: [] }, null, 2)}\n`;
const indexRecord = (number, date) => ({
  subjectKey: `problem:洛谷|${number}`,
  date,
  recordRef: { memberId: USER.login, date, recordId: `other-${number}` },
  problem: { name: number, platform: "洛谷", problemNumber: number },
  href: `/problem/${date}/${number}/`,
});

test("ref 冲突重试时个人索引按新 head 重算，不会覆盖并发写入的记录", async (context) => {
  const github = concurrentGitHub(new Map([[LEGACY_INDEX, `${JSON.stringify({ schemaVersion: 1, memberId: USER.login, member: USER.member, records: [indexRecord("P1000", "2026-08-01")] }, null, 2)}\n`]]));
  let concurrentHead = null;
  github.onRefPatch = () => {
    if (concurrentHead) return null;
    // 另一个请求在我们的 ref 更新之前落库：它往索引里追加了自己那天的记录。
    concurrentHead = github.externalCommit((snapshot) => {
      const index = JSON.parse(snapshot.get(LEGACY_INDEX));
      index.records.push(indexRecord("P2000", "2026-08-02"));
      snapshot.set(LEGACY_INDEX, `${JSON.stringify(index, null, 2)}\n`);
    });
    return concurrentHead;
  };
  context.mock.method(globalThis, "fetch", github.fetch);

  await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null);

  const numbers = github.index().records.map((record) => record.problem.problemNumber);
  assert.deepEqual(numbers.slice(0, 2), ["P1000", "P2000"], "并发写入的记录必须保留");
  assert.deepEqual(numbers.slice(2), ["P1115", "20C"], "本次保存的题目也要写进索引");
  assert.ok(github.contentsReads.includes(concurrentHead), "重试时必须按新的 head 重新读取索引");
});

test("ref 冲突重试期间同一天被改动则报版本冲突，不覆盖别人那天的记录", async (context) => {
  const github = concurrentGitHub(new Map([[LEGACY_INDEX, emptyIndex()]]));
  context.mock.method(globalThis, "fetch", github.fetch);
  const created = await saveLog(USER, "2026-08-11", { problems: PROBLEMS }, null);

  let concurrentHead = null;
  github.onRefPatch = () => {
    if (concurrentHead) return null;
    concurrentHead = github.externalCommit((snapshot) => { snapshot.set(`${ROOT}/9-desc.md`, "别人给同一天加的题面"); });
    return concurrentHead;
  };

  await assert.rejects(
    () => saveLog(USER, "2026-08-11", { problems: PROBLEMS }, created.revision),
    (error) => error.code === "VERSION_CONFLICT" && error.status === 409,
  );
  assert.equal(github.head(), concurrentHead, "冲突重试失败后不能再推进 ref");
});

