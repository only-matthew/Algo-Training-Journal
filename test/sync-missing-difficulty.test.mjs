import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncMissingDifficulty } from "../scripts/sync-missing-difficulty.mjs";

function fixture(t, problems) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "difficulty-sync-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "logs"));
  const file = path.join(root, "logs", "meta.json");
  fs.writeFileSync(file, JSON.stringify({ updatedAt: "2026-09-22T00:00:00Z", problems }));
  return { root, file };
}

test("补全两平台、同题只查一次，保留已有难度及训练时间", async (t) => {
  const cf = { platform: "Codeforces", problemNumber: "2266A", difficulty: "未标注" };
  const { root, file } = fixture(t, [cf, cf, { ...cf, difficultyRating: 1200 }, { platform: "洛谷", problemNumber: "P1000", difficulty: "未标注" }]);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    if (url.includes("codeforces")) return Response.json({ status: "OK", result: { problems: [{ contestId: 2266, index: "A", rating: 800 }] } });
    if (!options.headers.Cookie) return new Response(null, { status: 302, headers: { "set-cookie": "C3VK=test; Path=/" } });
    return new Response('<script type="application/json" id="lentille-context">{"data":{"problem":{"difficulty":3}}}</script>');
  };
  assert.deepEqual(await syncMissingDifficulty({ root, fetchImpl, write: true, report() {} }), { updated: 3, pending: 0 });
  const data = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(data.problems.map((p) => p.difficultyRating), [800, 800, 1200, 1300]);
  assert.equal(data.updatedAt, "2026-09-22T00:00:00Z");
  assert.equal(calls.length, 3);
  await syncMissingDifficulty({ root, write: true, fetchImpl: () => { throw new Error("must not fetch"); }, report() {} });
});

test("未公布和接口失败不写文件，下次构建公布后能补全", async (t) => {
  const { root, file } = fixture(t, [
    { platform: "Codeforces", problemNumber: "2266A", difficulty: "未标注" },
    { platform: "Luogu", problemNumber: "P1000", difficulty: "暂无评定" },
  ]);
  const before = fs.readFileSync(file, "utf8");
  const report = () => {};
  const fetchImpl = async (url) => url.includes("codeforces")
    ? Response.json({ status: "OK", result: { problems: [{ contestId: 2266, index: "A" }] } })
    : new Response("unavailable", { status: 503 });
  assert.deepEqual(await syncMissingDifficulty({ root, fetchImpl, write: true, report }), { updated: 0, pending: 2 });
  assert.equal(fs.readFileSync(file, "utf8"), before);
  const resolved = async (url) => url.includes("codeforces")
    ? Response.json({ status: "OK", result: { problems: [{ contestId: 2266, index: "A", rating: 900 }] } })
    : new Response('<script id="lentille-context">{"data":{"problem":{"difficulty":0}}}</script>');
  assert.deepEqual(await syncMissingDifficulty({ root, fetchImpl: resolved, write: true, report }), { updated: 1, pending: 1 });
  assert.equal(JSON.parse(fs.readFileSync(file)).problems[0].difficultyRating, 900);
});
