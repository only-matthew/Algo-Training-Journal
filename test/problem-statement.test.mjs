import test from "node:test";
import assert from "node:assert/strict";
import { fetchCodeforcesStatement, fetchLuoguStatement, fetchStatement, parseCodeforcesStatement, parseLuoguStatement, validateCodeforcesUrl } from "../workers/services/problem-statement.mjs";

const HTML = `<div class="problem-statement"><div class="header"><div class="title">A. Test</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>Find $$$x$$$.</p><div class="input-specification"><p>Input</p></div><div class="output-specification"><p>Output</p></div><img src="/img.png"></div>`;
const CHALLENGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cloudflare challenge</body></html>`;
const LUOGU_URL = "https://www.luogu.com.cn/problem/CF4A";
const LUOGU_PROBLEM = {
  pid: "CF4A",
  name: "Watermelon",
  difficulty: 1,
  content: {
    name: "Watermelon",
    background: "",
    description: "<p>给定 $w$，判断能否分成两个正偶数。</p>",
    formatI: "<p>一个整数 $w$（$1 \\le w \\le 100$）。</p>",
    formatO: "<p>输出 YES 或 NO。</p>",
    hint: "<p>注意 $w=2$ 时无解。</p>",
  },
};
// 洛谷页面把内嵌 JSON 里的 "</" 转义成 "<\/"（否则正文里的标签会提前结束 script），这里照做。
const luoguPage = (problem) => `<html><head><title>CF4A Watermelon - 洛谷</title></head><body><script id="lentille-context" type="application/json">${JSON.stringify({ data: { problem } }).replace(/<\//g, "<\\/")}</script></body></html>`;

// url 路由替身：按顺序匹配 URL，记录每次请求，未命中的 URL 直接失败。
function routedFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, headers: options.headers || {} });
    for (const [pattern, handler] of routes) if (pattern.test(target)) return handler(target, options);
    throw new Error(`unexpected request: ${target}`);
  };
  impl.calls = calls;
  return impl;
}
const BLOCKED = [/^https:\/\/codeforces\.com\//, () => new Response(CHALLENGE, { status: 403 })];
const MIRROR_OK = [new RegExp(`^${LUOGU_URL}$`), () => new Response(luoguPage(LUOGU_PROBLEM))];

test("CF 地址限制域名和题号", () => {
  assert.equal(validateCodeforcesUrl("", "4A").hostname, "codeforces.com");
  assert.throws(() => validateCodeforcesUrl("https://evil.example/4/A", "4A"));
  assert.throws(() => validateCodeforcesUrl("https://codeforces.com/contest/5/problem/A", "4A"));
});

test("题面解析保留标题、公式并报告外部图片", () => {
  const result = parseCodeforcesStatement(HTML);
  assert.match(result.description, /# A\. Test/);
  assert.match(result.description, /\$x\$/);
  assert.deepEqual(result.warnings, ["external-images"]);
});

test("题面保留多个样例、代码空白与上下标", () => {
  const html = `<div class="problem-statement"><div class="header"><div class="title">B. Sample</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>a<sup>2</sup> + b<sub>i</sub></p><div class="sample-tests"><div class="input"><div class="title">Input</div><pre>1\n  2</pre></div><div class="output"><div class="title">Output</div><pre>3</pre></div><div class="input"><div class="title">Input</div><div class="test-example-line">x</div><div class="test-example-line"> y</div></div></div></div>`;
  const result = parseCodeforcesStatement(html).description;
  assert.match(result, /a\^\(2\) \+ b_\(i\)/);
  assert.match(result, /```\n1\n  2\n```/);
  assert.match(result, /x\n y/);
});

test("上游失败是可恢复的单题降级", async () => {
  const result = await fetchCodeforcesStatement({ problemNumber: "4A" }, { fetchImpl: async () => new Response("", { status: 404 }) });
  assert.deepEqual(result, { status: "unavailable", problemNumber: "4A", reason: "not-found", retryable: false });
});

test("CF 请求带浏览器请求头，不再只发 Accept", async () => {
  const fetchImpl = routedFetch([[/^https:\/\/codeforces\.com\//, () => new Response(HTML)]]);
  await fetchCodeforcesStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.match(fetchImpl.calls[0].headers["User-Agent"], /Mozilla\/5\.0/);
  assert.match(fetchImpl.calls[0].headers["Accept-Language"], /en-US/);
});

test("洛谷镜像题面按小节转成 Markdown，保留公式并跳过空小节", () => {
  const result = parseLuoguStatement(luoguPage(LUOGU_PROBLEM), "4A");
  assert.match(result.description, /^# Watermelon/);
  assert.match(result.description, /## 题目描述/);
  assert.match(result.description, /## 输入格式/);
  assert.match(result.description, /## 输出格式/);
  assert.match(result.description, /## 说明\/提示/);
  assert.doesNotMatch(result.description, /## 背景/);
  assert.match(result.description, /\$w\$/);
});

test("洛谷镜像接受字符串题面，并在正文没有代码块时补上 samples", () => {
  const problem = { pid: "CF4A", name: "Watermelon", content: "<p>正文没有样例</p>", samples: [{ in: "8", out: "YES" }, { input: "2", output: "NO" }] };
  const result = parseLuoguStatement(luoguPage(problem), "4A");
  assert.match(result.description, /### 样例 1\n输入：\n```\n8\n```/);
  assert.match(result.description, /### 样例 2\n输入：\n```\n2\n```/);
  const withPre = parseLuoguStatement(luoguPage({ ...problem, content: "<p>样例在正文里</p><pre>8</pre>" }), "4A");
  assert.doesNotMatch(withPre.description, /### 样例 1/);
});

test("洛谷镜像解析图片、表格与脚本", () => {
  const problem = { pid: "CF4A", name: "Watermelon", content: { description: '<p>图：<img src="/upload/w.png" alt="w"></p><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><script>alert(1)</script>' } };
  const result = parseLuoguStatement(luoguPage(problem), "4A");
  assert.match(result.description, /!\[w\]\(https:\/\/www\.luogu\.com\.cn\/upload\/w\.png\)/);
  assert.match(result.description, /\| a \| b \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  assert.deepEqual(result.warnings, ["external-images"]);
  assert.doesNotMatch(result.description, /alert/);
});

test("洛谷镜像拒绝题号不符与挑战页", () => {
  assert.throws(() => parseLuoguStatement(luoguPage({ ...LUOGU_PROBLEM, pid: "CF5A" }), "4A"), /parse-failed/);
  assert.throws(() => parseLuoguStatement(CHALLENGE, "4A"), /blocked/);
});

test("洛谷镜像处理 C3VK 挑战 cookie 后重试", async () => {
  let luoguCalls = 0;
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\//, () => new Response(CHALLENGE, { status: 403 })],
    [new RegExp(`^${LUOGU_URL}$`), (_url, options) => {
      luoguCalls += 1;
      if (luoguCalls === 1) return new Response("", { status: 302, headers: { Location: "/problem/CF4A", "Set-Cookie": "C3VK=abc123; Path=/; Max-Age=3600" } });
      assert.equal(options.headers.Cookie, "C3VK=abc123");
      return new Response(luoguPage(LUOGU_PROBLEM));
    }],
  ]);
  const result = await fetchLuoguStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.source.kind, "luogu-mirror");
  assert.equal(result.source.url, LUOGU_URL);
  assert.deepEqual(result.warnings, ["mirror-source"]);
  assert.equal(luoguCalls, 2);
});

test("CF 成功时不访问镜像", async () => {
  const fetchImpl = routedFetch([[/^https:\/\/codeforces\.com\//, () => new Response(HTML)]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.source.kind, "codeforces-html");
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), ["https://codeforces.com/problemset/problem/4/A?locale=en"]);
});

test("CF 被反爬拦下时回退洛谷镜像", async () => {
  const fetchImpl = routedFetch([BLOCKED, MIRROR_OK]);
  const result = await fetchStatement({ problemNumber: "4a" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.problemNumber, "4A");
  assert.equal(result.source.kind, "luogu-mirror");
  assert.deepEqual(result.warnings, ["mirror-source"]);
  assert.match(result.description, /# Watermelon/);
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), ["https://codeforces.com/problemset/problem/4/A?locale=en", LUOGU_URL]);
});

test("两个来源都失败时保留主来源的失败原因", async () => {
  const fetchImpl = routedFetch([BLOCKED, [new RegExp(`^${LUOGU_URL}$`), () => new Response(CHALLENGE, { status: 403 })]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.deepEqual(result, { status: "unavailable", problemNumber: "4A", reason: "blocked", retryable: false });
  assert.equal(fetchImpl.calls.length, 2);
});

test("CF 明确没有这道题时不浪费时间试镜像", async () => {
  const fetchImpl = routedFetch([[/^https:\/\/codeforces\.com\//, () => new Response("", { status: 404 })]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.reason, "not-found");
  assert.equal(fetchImpl.calls.length, 1);
});

test("镜像返回解析失败不会覆盖主来源原因", async () => {
  const fetchImpl = routedFetch([BLOCKED, [new RegExp(`^${LUOGU_URL}$`), () => new Response("<html><body>没有题面</body></html>")]]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.reason, "blocked");
});
