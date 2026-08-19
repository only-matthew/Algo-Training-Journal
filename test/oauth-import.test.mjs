import assert from "node:assert/strict";
import test from "node:test";

import { fetchCodeforcesAccepted, fetchLuoguTitles } from "../workers/oauth.mjs";

test("fetchCodeforcesAccepted keeps AC submissions, dedupes by problem, and formats numbers", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    status: "OK",
    result: [
      { id: 111, verdict: "OK", problem: { contestId: 20, index: "C", name: "Dijkstra?", rating: 1500, tags: ["graphs", "shortest paths"] } },
      // 同一道题重复提交：应只保留一条（最近一次）
      { id: 222, verdict: "OK", problem: { contestId: 20, index: "C", name: "Dijkstra?", rating: 1500, tags: ["graphs"] } },
      // 非 AC 提交：应被过滤
      { id: 333, verdict: "WRONG_ANSWER", problem: { contestId: 4, index: "A", name: "Watermelon" } },
      { id: 444, verdict: "OK", problem: { contestId: 4, index: "A", name: "Watermelon" } },
      // 缺 problem 对象：跳过
      { id: 555, verdict: "OK" },
    ],
  }));

  const problems = await fetchCodeforcesAccepted("tourist", { fetchImpl });
  assert.equal(problems.length, 2);
  assert.deepEqual(problems[0], {
    name: "Dijkstra?",
    platform: "Codeforces",
    problemNumber: "20C",
    submissionUrl: "https://codeforces.com/contest/20/submission/111",
    rating: 1500,
    tags: ["graphs", "shortest paths"],
  });
  assert.deepEqual(problems[1], {
    name: "Watermelon",
    platform: "Codeforces",
    problemNumber: "4A",
    submissionUrl: "https://codeforces.com/contest/4/submission/444",
    tags: [],
  });
});

test("fetchCodeforcesAccepted rejects empty handle and failed API responses", async () => {
  await assert.rejects(
    fetchCodeforcesAccepted("  ", { fetchImpl: async () => { throw new Error("must not fetch"); } }),
    /用户名/,
  );
  const fetchImpl = async () => new Response(JSON.stringify({ status: "FAILED", comment: "handle not found" }));
  await assert.rejects(fetchCodeforcesAccepted("ghost", { fetchImpl }), /不存在/);
  const networkError = async () => new Response("boom", { status: 500 });
  await assert.rejects(fetchCodeforcesAccepted("tourist", { fetchImpl: networkError }), /接口不可用/);
});

test("fetchLuoguTitles parses titles from server-rendered problem pages", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /^https:\/\/www\.luogu\.com\.cn\/problem\/P1001$/);
    return new Response("<html><head><title>P1001 最大子段和 - 洛谷 | 计算机科学教育新生态</title></head></html>");
  };
  const problems = await fetchLuoguTitles("P1001", { fetchImpl });
  assert.deepEqual(problems, [{ name: "最大子段和", platform: "洛谷", problemNumber: "P1001" }]);
});

test("fetchLuoguTitles handles multiple numbers and falls back on failure", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/P3376")) return new Response("<html><title>P3376 【模板】网络最大流 - 洛谷</title></html>");
    return new Response("Not Found", { status: 404 });
  };
  const problems = await fetchLuoguTitles("p1001 P3376", { fetchImpl });
  assert.deepEqual(problems, [
    { name: "P1001", platform: "洛谷", problemNumber: "P1001" },
    { name: "【模板】网络最大流", platform: "洛谷", problemNumber: "P3376" },
  ]);
});

test("fetchLuoguTitles rejects empty or invalid input without fetching", async () => {
  const noFetch = async () => { throw new Error("must not fetch"); };
  await assert.rejects(fetchLuoguTitles("", { fetchImpl: noFetch }), /题号/);
  await assert.rejects(fetchLuoguTitles("abc def", { fetchImpl: noFetch }), /题号/);
});
