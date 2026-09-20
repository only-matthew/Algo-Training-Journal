import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import worker, { fetchCodeforcesAccepted, fetchLuoguProblems, fetchAtCoderAccepted, seal } from "../workers/oauth.mjs";

const now = Math.floor(Date.now() / 1000);
const DAY = 86400;

test("fetchCodeforcesAccepted keeps only AC submissions within the last 3 days, deduped", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    status: "OK",
    result: [
      { id: 111, creationTimeSeconds: now - 3600, verdict: "OK", problem: { contestId: 20, index: "C", name: "Dijkstra?", rating: 1500, tags: ["graphs", "shortest paths"] } },
      // 同一道题 3 天内重复 AC：应只保留最近一条
      { id: 222, creationTimeSeconds: now - 2 * DAY, verdict: "OK", problem: { contestId: 20, index: "C", name: "Dijkstra?", rating: 1500, tags: ["graphs"] } },
      // 3 天内的另一道题
      { id: 333, creationTimeSeconds: now - 2 * DAY, verdict: "OK", problem: { contestId: 4, index: "A", name: "Watermelon" } },
      // 超过 3 天：应被过滤
      { id: 444, creationTimeSeconds: now - 4 * DAY, verdict: "OK", problem: { contestId: 10, index: "A", name: "Old Problem" } },
      // 非 AC：应被过滤
      { id: 555, creationTimeSeconds: now - 3600, verdict: "WRONG_ANSWER", problem: { contestId: 1, index: "A", name: "Failed" } },
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
  assert.equal(problems[1].problemNumber, "4A");
});

test("fetchCodeforcesAccepted pages forward until the 3-day window is covered", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    // 第 1 页：满 2 条且都在窗口内 → 需要翻页；第 2 页：最后一条已过期 → 停止
    if (String(url).includes("from=1")) {
      return new Response(JSON.stringify({
        status: "OK",
        result: [
          { id: 1, creationTimeSeconds: now - 3600, verdict: "OK", problem: { contestId: 1, index: "A", name: "Fresh A" } },
          { id: 2, creationTimeSeconds: now - 3600, verdict: "OK", problem: { contestId: 1, index: "B", name: "Fresh B" } },
        ],
      }));
    }
    return new Response(JSON.stringify({
      status: "OK",
      result: [
        { id: 3, creationTimeSeconds: now - 2 * DAY, verdict: "OK", problem: { contestId: 2, index: "A", name: "In Window" } },
        { id: 4, creationTimeSeconds: now - 10 * DAY, verdict: "OK", problem: { contestId: 2, index: "B", name: "Too Old" } },
      ],
    }));
  };

  const problems = await fetchCodeforcesAccepted("tourist", { fetchImpl, perPage: 2, maxPages: 3 });
  assert.equal(urls.length, 2, "should fetch exactly two pages");
  assert.match(urls[1], /from=3/);
  assert.deepEqual(problems.map((p) => p.name), ["Fresh A", "Fresh B", "In Window"]);
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

function luoguPage({ pid, name, difficulty, content }) {
  const problem = { pid, name };
  if (difficulty !== undefined) problem.difficulty = difficulty;
  if (content !== undefined) {
    // 真实洛谷 content 为对象结构 { description, background, hint, ... }，而非字符串
    problem.content = typeof content === "string" ? { description: content } : content;
  }
  return `<html><head><title>${pid} ${name} - 洛谷 | 计算机科学教育新生态</title></head><body><script id="lentille-context" type="application/json">{"data":{"problem":${JSON.stringify(problem)}}}</script></body></html>`;
}

test("fetchLuoguProblems parses name, official difficulty and description from object content", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /^https:\/\/www\.luogu\.com\.cn\/problem\/P3376$/);
    return new Response(luoguPage({ pid: "P3376", name: "【模板】网络最大流", difficulty: 6, content: "<p>给定网络，求最大流。</p>\n<p>数据范围较大。</p>" }));
  };
  const problems = await fetchLuoguProblems("P3376", { fetchImpl });
  assert.equal(problems.length, 1);
  // 题面与「抓取 CF 题面」共用一套解析：Markdown 小节标题、公式与图片都保留下来。
  assert.deepEqual(problems[0], {
    name: "【模板】网络最大流",
    platform: "洛谷",
    problemNumber: "P3376",
    difficulty: "提高+/省选-",
    description: "# 【模板】网络最大流\n\n## 题目描述\n\n给定网络，求最大流。\n\n数据范围较大。",
  });
  assert.ok(!problems[0].description.includes("[object Object]"), "description must not be [object Object]");
});

test("fetchLuoguProblems archives statement images instead of inserting CDN links", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const fileName = `statement-${createHash("sha256").update(png).digest("hex")}.png`;
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes("cdn.luogu.com.cn")) {
      assert.equal(target, "https://cdn.luogu.com.cn/upload/image_hosting/oe7wpwsi.png");
      return new Response(png, { headers: { "Content-Type": "application/octet-stream" } });
    }
    assert.match(target, /^https:\/\/www\.luogu\.com\.cn\/problem\/P1904$/);
    return new Response(luoguPage({ pid: "P1904", name: "天际线问题", difficulty: 7, content: { description: "<p>如图：</p><p>![建筑轮廓](https://cdn.luogu.com.cn/upload/image_hosting/oe7wpwsi.png)</p>" } }));
  };
  const [problem] = await fetchLuoguProblems("P1904", { fetchImpl });
  assert.match(problem.description, new RegExp(`!\\[建筑轮廓\\]\\(\\./${fileName}\\)`));
  assert.doesNotMatch(problem.description, /cdn\.luogu\.com\.cn/);
  assert.equal(problem.statementImages.length, 1);
  assert.deepEqual({ ...problem.statementImages[0], data: undefined }, { fileName, sha256: fileName.slice(10, 74), mimeType: "image/png", bytes: png.byteLength, data: undefined });
});

test("fetchLuoguProblems falls back to raw string content without breaking", async () => {
  const fetchImpl = async () => new Response(luoguPage({ pid: "P1001", name: "A+B Problem", difficulty: 1, content: "直接字符串题面" }));
  const [problem] = await fetchLuoguProblems("P1001", { fetchImpl });
  assert.equal(problem.description, "# A+B Problem\n\n## 题目描述\n\n直接字符串题面");
});

test("fetchLuoguProblems maps all official difficulty levels", async () => {
  const expected = ["暂无评定", "入门", "普及-", "普及", "普及+/提高-", "提高", "提高+/省选-", "省选/NOI-", "NOI/NOI+/CTS"];
  for (let difficulty = 0; difficulty <= 8; difficulty += 1) {
    const fetchImpl = async () => new Response(luoguPage({ pid: "P1001", name: "A+B Problem", difficulty }));
    const [problem] = await fetchLuoguProblems("P1001", { fetchImpl });
    assert.equal(problem.difficulty, expected[difficulty], `difficulty ${difficulty}`);
  }
});

test("fetchLuoguProblems falls back to <title> when lentille-context is missing", async () => {
  const fetchImpl = async () => new Response("<html><head><title>P1001 A+B Problem - 洛谷 | 计算机科学教育新生态</title></head></html>");
  const [problem] = await fetchLuoguProblems("P1001", { fetchImpl });
  assert.equal(problem.name, "A+B Problem");
  assert.equal(problem.difficulty, "未标注");
  assert.equal(problem.description, "");
});

test("fetchLuoguProblems handles multiple numbers and falls back on failure", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/P3376")) return new Response(luoguPage({ pid: "P3376", name: "【模板】网络最大流", difficulty: 6 }));
    return new Response("Not Found", { status: 404 });
  };
  const problems = await fetchLuoguProblems("p1001 P3376", { fetchImpl });
  assert.deepEqual(problems, [
    { name: "P1001", platform: "洛谷", problemNumber: "P1001", difficulty: "未标注", description: "" },
    { name: "【模板】网络最大流", platform: "洛谷", problemNumber: "P3376", difficulty: "提高+/省选-", description: "" },
  ]);
});

test("fetchLuoguProblems rejects empty or invalid input without fetching", async () => {
  const noFetch = async () => { throw new Error("must not fetch"); };
  await assert.rejects(fetchLuoguProblems("", { fetchImpl: noFetch }), /题号/);
  await assert.rejects(fetchLuoguProblems("abc def", { fetchImpl: noFetch }), /题号/);
});

// ── AtCoder（kenkoooo AtCoder Problems API）──

function atcoderCatalog(entries) {
  return new Response(JSON.stringify(entries));
}

test("fetchAtCoderAccepted keeps only recent AC submissions, deduped and enriched", async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("/resources/merged-problems.json")) {
      return atcoderCatalog([
        { id: "abc001_a", title: "A - 高橋君とペンギン", difficulty: 400 },
        { id: "abc001_b", title: "B - 問題", difficulty: -400 },
      ]);
    }
    assert.match(u, /user\/submissions\?user=tourist&from_second=\d+/);
    return new Response(JSON.stringify([
      { id: 1, epoch_second: now - 3600, problem_id: "abc001_a", result: "AC" },
      // 同一道题 3 天内多次 AC：应只保留最近一次
      { id: 2, epoch_second: now - 2 * DAY, problem_id: "abc001_a", result: "AC" },
      // 3 天内的另一道题
      { id: 3, epoch_second: now - 2 * DAY, problem_id: "abc001_b", result: "AC" },
      // 超过 3 天：不应出现（from_second 从窗口起点开始，API 不会返回更早记录）
      { id: 4, epoch_second: now - 4 * DAY, problem_id: "abc001_c", result: "AC" },
      // 非 AC：应被过滤
      { id: 5, epoch_second: now - 3600, problem_id: "abc001_d", result: "WA" },
      // 无题号：应被过滤
      { id: 6, epoch_second: now - 3600, result: "AC" },
    ]));
  };

  const problems = await fetchAtCoderAccepted("tourist", { fetchImpl });
  assert.equal(problems.length, 2);
  // 结果按最近 AC 时间倒序
  assert.deepEqual(problems[0], {
    name: "A - 高橋君とペンギン",
    platform: "AtCoder",
    problemNumber: "abc001_a",
    rating: 400,
  });
  assert.equal(problems[1].problemNumber, "abc001_b");
  assert.equal(problems[1].rating, -400, "负难度也应映射为 rating");
});

test("fetchAtCoderAccepted pages forward until the page is not full", async () => {
  const submissions = [
    { id: 1, epoch_second: now - 3 * 3600, problem_id: "abc001_a", result: "AC" },
    { id: 2, epoch_second: now - 2 * 3600, problem_id: "abc002_a", result: "AC" },
    { id: 3, epoch_second: now - 3600, problem_id: "abc003_a", result: "AC" },
  ];
  const urls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("/resources/merged-problems.json")) {
      return atcoderCatalog([{ id: "abc003_a", title: "C 题", difficulty: null }]);
    }
    const from = Number(u.match(/from_second=(\d+)/)[1]);
    return new Response(JSON.stringify(submissions.filter((s) => s.epoch_second >= from).slice(0, 2)));
  };

  const problems = await fetchAtCoderAccepted("tourist", { fetchImpl, perPage: 2, maxPages: 3 });
  const pages = urls.filter((u) => u.includes("from_second="));
  assert.equal(pages.length, 2, "第 1 页满 2 条应继续翻页");
  assert.match(pages[1], /from_second=\d+/);
  assert.ok(Number(pages[1].match(/from_second=(\d+)/)[1]) === now - 2 * 3600 + 1, "续页时间应为上一页最后一条 + 1");
  assert.deepEqual(problems.map((p) => p.problemNumber), ["abc003_a", "abc002_a", "abc001_a"]);
  assert.equal(problems[0].name, "C 题", "难度为 null 时不应携带 rating");
  assert.ok(!("rating" in problems[0]));
});

test("fetchAtCoderAccepted falls back to problem ids when the catalog is unavailable", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/resources/merged-problems.json")) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify([{ id: 1, epoch_second: now - 3600, problem_id: "abc001_a", result: "AC" }]));
  };
  const problems = await fetchAtCoderAccepted("tourist", { fetchImpl });
  assert.deepEqual(problems, [{ name: "abc001_a", platform: "AtCoder", problemNumber: "abc001_a" }]);
});

test("fetchAtCoderAccepted rejects empty handle and handles empty results", async () => {
  await assert.rejects(
    fetchAtCoderAccepted("  ", { fetchImpl: async () => { throw new Error("must not fetch"); } }),
    /用户名/,
  );
  const fetchImpl = async (url) => {
    if (String(url).includes("/resources/merged-problems.json")) return atcoderCatalog([]);
    return new Response("[]");
  };
  const problems = await fetchAtCoderAccepted("ghost", { fetchImpl });
  assert.deepEqual(problems, []);
});

// ── 会话预置的用户名（导入面板自动预填）──

test("/api/session 下发预置的 CF 与 AtCoder 用户名", async () => {
  const secret = "test-session-secret";
  const cookie = await seal({ token: "token", login: "only-matthew", member: "廖夏", csrfToken: "csrf", exp: Date.now() + 600000 }, secret);
  const response = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
    headers: { Origin: "https://train.xialiao.org", Cookie: `__Host-journal_session=${cookie}` },
  }), { SESSION_SECRET: secret });
  const body = await response.json();
  assert.equal(body.cfHandle, "onlymatt");
  assert.equal(body.atcoderHandle, "only_matthew");

  // 没有预置的队员不能凭空得到别人的 handle。
  const other = await seal({ token: "token", login: "wzzzzhhhhh", member: "王梓豪", csrfToken: "csrf", exp: Date.now() + 600000 }, secret);
  const otherResponse = await worker.fetch(new Request("https://algo-oauth.xialiao.org/api/session", {
    headers: { Origin: "https://train.xialiao.org", Cookie: `__Host-journal_session=${other}` },
  }), { SESSION_SECRET: secret });
  const otherBody = await otherResponse.json();
  assert.equal(otherBody.cfHandle, "hnuwang");
  assert.equal("atcoderHandle" in otherBody, false);
});
