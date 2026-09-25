import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { archiveStatementImages, fetchAtCoderStatement, fetchCodeforcesStatement, fetchLuoguAtCoderStatement, fetchLuoguStatement, fetchStatement, parseAtCoderProblemNumber, parseAtCoderStatement, parseCodeforcesStatement, parseLuoguAtCoderStatement, parseLuoguStatement, statementFromAtCoderHtml, validateCodeforcesUrl } from "../workers/services/problem-statement.mjs";

const HTML = `<div class="problem-statement"><div class="header"><div class="title">A. Test</div><div class="time-limit">1 second</div><div class="memory-limit">256 megabytes</div></div><p>Find $$$x$$$.</p><div class="input-specification"><p>Input</p></div><div class="output-specification"><p>Output</p></div><img src="/img.png"></div>`;
const CHALLENGE = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cloudflare challenge</body></html>`;
const LUOGU_URL = "https://www.luogu.com.cn/problem/CF4A";
// 一个字节够用的合法 PNG：归档只看魔数，不需要真的能解码。
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
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

test("时间/内存限制不把 property-title 标签拼进正文", () => {
  const html = `<div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div><div class="time-limit"><div class="property-title">time limit per test</div>1 second</div><div class="memory-limit"><div class="property-title">memory limit per test</div>64 megabytes</div><div class="input-file input-standard"><div class="property-title">input</div>stdin</div></div><p>One hot summer day.</p></div>`;
  const description = parseCodeforcesStatement(html, "4A").description;
  assert.match(description, /时间限制：1 second/);
  assert.match(description, /内存限制：64 megabytes/);
  assert.doesNotMatch(description, /time limit per test|memory limit per test/);
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

test("洛谷同时返回中英文题面时默认选择中文本地化内容", () => {
  const problem = {
    pid: "CF4A",
    name: "[USACO08FEB] Meteor Shower S",
    content: { locale: "en", description: "Bessie hears that a meteor shower is coming." },
    contenu: { locale: "zh-CN", description: "贝茜听说一场特别的流星雨即将到来。" },
  };
  const result = parseLuoguStatement(luoguPage(problem), "4A");
  assert.match(result.description, /贝茜听说一场特别的流星雨/);
  assert.doesNotMatch(result.description, /Bessie hears/);
});

test("洛谷中文本地化内容为空时回退到原题面", () => {
  const problem = {
    pid: "CF4A",
    name: "Watermelon",
    content: { locale: "en", description: "Original statement." },
    contenu: { locale: "zh-CN", description: "", hint: null },
  };
  const result = parseLuoguStatement(luoguPage(problem), "4A");
  assert.match(result.description, /Original statement/);
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
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\/problemset\//, () => new Response(HTML)],
    [/^https:\/\/codeforces\.com\/img\.png$/, () => new Response(PNG, { headers: { "Content-Type": "image/png" } })],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.source.kind, "codeforces-html");
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), ["https://codeforces.com/problemset/problem/4/A?locale=en", "https://codeforces.com/img.png"]);
});

test("题面图片随抓取下载并改写成仓库文件名", async () => {
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\/problemset\//, () => new Response(HTML)],
    [/^https:\/\/codeforces\.com\/img\.png$/, (_url, options) => {
      // 图床按来源站校验 referer，缺了会被当成盗链。
      assert.equal(options.headers.Referer, "https://codeforces.com/");
      assert.match(options.headers.Accept, /image\//);
      return new Response(PNG, { headers: { "Content-Type": "image/png" } });
    }],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  const fileName = `statement-${sha(PNG)}.png`;
  assert.equal(result.status, "ok");
  // 描述里不再有外链：站点 CSP 只允许 'self' 与 data:，外链图片在站内加载不出来。
  assert.match(result.description, new RegExp(`!\\[image\\]\\(\\./${fileName}\\)`));
  assert.doesNotMatch(result.description, /codeforces\.com\/img\.png/);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.images, [{ fileName, sha256: sha(PNG), mimeType: "image/png", bytes: PNG.byteLength, data: Buffer.from(PNG).toString("base64") }]);
});

test("洛谷镜像正文里的 Markdown 图片语法同样会被归档", async () => {
  const problem = {
    pid: "CF4A",
    name: "Watermelon",
    content: { description: '<p>看图：</p><p>![示意图](https://cdn.luogu.com.cn/upload/pic/2262.png)</p>' },
  };
  const fetchImpl = routedFetch([
    BLOCKED,
    [new RegExp(`^${LUOGU_URL}$`), () => new Response(luoguPage(problem))],
    [/^https:\/\/cdn\.luogu\.com\.cn\/upload\/pic\/2262\.png$/, (_url, options) => {
      assert.equal(options.headers.Referer, "https://www.luogu.com.cn/");
      // 新版图床返回 application/octet-stream，只能按魔数判断类型。
      return new Response(GIF, { headers: { "Content-Type": "application/octet-stream" } });
    }],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  const fileName = `statement-${sha(GIF)}.gif`;
  assert.equal(result.source.kind, "luogu-mirror");
  assert.match(result.description, new RegExp(`!\\[示意图\\]\\(\\./${fileName}\\)`));
  assert.doesNotMatch(result.description, /cdn\.luogu\.com\.cn/);
  assert.equal(result.images[0].fileName, fileName);
  assert.equal(result.images[0].mimeType, "image/gif");
  assert.deepEqual(result.warnings, ["mirror-source"]);
});

test("图片取不到时保留外链并留下警告，题面本身照常可用", async () => {
  const fetchImpl = routedFetch([
    [/^https:\/\/codeforces\.com\/problemset\//, () => new Response(HTML)],
    [/^https:\/\/codeforces\.com\/img\.png$/, () => new Response("", { status: 403 })],
  ]);
  const result = await fetchStatement({ problemNumber: "4A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.match(result.description, /!\[image\]\(https:\/\/codeforces\.com\/img\.png\)/);
  assert.deepEqual(result.images, []);
  assert.deepEqual(result.warnings, ["external-images"]);
});

test("内联 data: 图片直接解码归档，不再占用正文体积", async () => {
  const data = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
  const archived = await archiveStatementImages("![公式]({{statement-image:0}})", [{ url: data }], { fetchImpl: async () => { throw new Error("内联图片不应发起网络请求"); } });
  assert.equal(archived.failed, false);
  assert.equal(archived.description, `![公式](./statement-${sha(PNG)}.png)`);
  assert.equal(archived.images[0].mimeType, "image/png");
});

test("不支持归档的图片（如 SVG）保持外链", async () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const result = await archiveStatementImages("![图]({{statement-image:0}})", [{ url: "https://cdn.example/x.svg" }], { fetchImpl: async () => new Response(svg, { headers: { "Content-Type": "image/svg+xml" } }) });
  assert.equal(result.failed, true);
  assert.deepEqual(result.images, []);
  assert.equal(result.description, "![图](https://cdn.example/x.svg)");
});

test("同一张图重复出现只下载一次", async () => {
  let downloads = 0;
  const fetchImpl = async () => { downloads += 1; return new Response(PNG); };
  const result = await archiveStatementImages("![a]({{statement-image:0}}) ![b]({{statement-image:0}})", [{ url: "https://cdn.example/a.png" }], { fetchImpl });
  assert.equal(downloads, 1);
  assert.equal(result.description, `![a](./statement-${sha(PNG)}.png) ![b](./statement-${sha(PNG)}.png)`);
  assert.equal(result.images.length, 1);
});

test("超过单张或总量上限的图片退回外链，不进入归档清单", async () => {
  const fetchImpl = async () => new Response(PNG);
  // 单张上限：图片会被保存接口拒绝，所以这里必须拦住，而不是让保存整次失败。
  const single = await archiveStatementImages("![a]({{statement-image:0}})", [{ url: "https://cdn.example/a.png" }], { fetchImpl, maxImageBytes: PNG.byteLength - 1 });
  assert.deepEqual(single.images, []);
  assert.equal(single.failed, true);
  assert.equal(single.description, "![a](https://cdn.example/a.png)");

  // 总量上限：先到先得，后面的图片退回外链（用不同字节，避免被当成同一张图去重）。
  const fetchImplMixed = async (url) => new Response(String(url).endsWith("b.png") ? GIF : PNG);
  const total = await archiveStatementImages("![a]({{statement-image:0}}) ![b]({{statement-image:1}})", [{ url: "https://cdn.example/a.png" }, { url: "https://cdn.example/b.png" }], { fetchImpl: fetchImplMixed, maxTotalBytes: PNG.byteLength });
  assert.equal(total.images.length, 1);
  assert.equal(total.failed, true);
  assert.equal(total.description, `![a](./statement-${sha(PNG)}.png) ![b](https://cdn.example/b.png)`);
});

test("图片数量超过上限时多余的图片保持外链", async () => {
  const fetchImpl = async () => new Response(PNG);
  const result = await archiveStatementImages("![a]({{statement-image:0}}) ![b]({{statement-image:1}})", [{ url: "https://cdn.example/a.png" }, { url: "https://cdn.example/b.png" }], { fetchImpl, maxImages: 1 });
  assert.equal(result.images.length, 1);
  assert.equal(result.failed, true);
  assert.match(result.description, /!\[b\]\(https:\/\/cdn\.example\/b\.png\)/);
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

// ── AtCoder 官方题面（atcoder.jp/contests/<contest>/tasks/<task>）─────────────
const ATCODER_URL = "https://atcoder.jp/contests/abc381/tasks/abc381_a?lang=en";
const ATCODER_IMAGE_URL = "https://img.atcoder.jp/abc381/fig.png";
// 结构照抄真实题目页：题面在 #task-statement 里分 lang-ja / lang-en 两套，
// 小节是 div.part > section > h3，公式写在 <var>，表格行包在 thead/tbody 里。
function atcoderPage({ ogUrl = ATCODER_URL, english = true, japanese = true } = {}) {
  const ja = japanese ? `<span class="lang-ja"><h3>問題文</h3><p>日本語の本文</p></span>` : "";
  const en = english ? `<span class="lang-en"><p>Score : <var>150</var> points</p>
<div class="part"><section><h3>Problem Statement</h3><p>Given <var>N</var>, print <var>\\frac{|T|+1}{2}</var> and <code>1</code>.</p>
<ul><li><var>1 \\leq N \\leq 100</var></li></ul></section></div>
<div class="part"><section><h3>Sample Input 1</h3><pre>5
11/22
</pre></section></div>
<table class="table table-bordered"><thead><tr><th>Input</th><th>Output</th></tr></thead><tbody><tr><td><code>3</code></td><td><code>2</code></td></tr><tr></tr></tbody></table>
<img src="${ATCODER_IMAGE_URL}" alt="figure"></span>` : "";
  return `<!DOCTYPE html><html><head><title>A - 11/22 String</title><meta property="og:url" content="${ogUrl}"></head><body>
<p>Time Limit: 2 sec / Memory Limit: 1024 MiB</p>
<div id="task-statement"><span class="lang">${ja}${en}</span></div></body></html>`;
}

test("AtCoder 题号解析：比赛 ID 取最后一个下划线之前的部分", () => {
  assert.deepEqual(parseAtCoderProblemNumber("ABC381_A"), { contest: "abc381", problemNumber: "abc381_a" });
  assert.deepEqual(parseAtCoderProblemNumber(" chokudai_S001_a "), { contest: "chokudai_s001", problemNumber: "chokudai_s001_a" });
  for (const value of ["abc381", "abc381_", "_a", "abc381/a", "abc381.a", ""]) {
    assert.equal(parseAtCoderProblemNumber(value), null, `应拒绝：${JSON.stringify(value)}`);
  }
});

test("AtCoder 题面取官方英文页，保留公式、行内代码、样例与表格", () => {
  const parsed = parseAtCoderStatement(atcoderPage(), "abc381_a");
  assert.match(parsed.description, /^# A - 11\/22 String/);
  assert.match(parsed.description, /时间限制：2 sec/);
  assert.match(parsed.description, /内存限制：1024 MiB/);
  assert.match(parsed.description, /### Problem Statement/);
  assert.match(parsed.description, /### Sample Input 1/);
  assert.match(parsed.description, /\$150\$/);
  assert.match(parsed.description, /\$1 \\leq N \\leq 100\$/);
  assert.ok(parsed.description.includes("$\\frac{|T|+1}{2}$"), parsed.description);
  assert.ok(parsed.description.includes("`1`"), parsed.description);
  assert.match(parsed.description, /\| Input \| Output \|\n\| --- \| --- \|\n\| `3` \| `2` \|/);
  assert.match(parsed.description, /```\n5\n11\/22\n```/);
  // 日文那套题面不能被拼进正文。
  assert.doesNotMatch(parsed.description, /日本語の本文/);
  assert.deepEqual(parsed.warnings, ["external-images"]);
});

test("AtCoder 只有日文题面时取日文并留下警告", () => {
  const parsed = parseAtCoderStatement(atcoderPage({ english: false }), "abc381_a");
  assert.match(parsed.description, /日本語の本文/);
  assert.deepEqual(parsed.warnings, ["ja-statement"]);
});

test("AtCoder 页面身份与题号不符时判为解析失败", () => {
  assert.throws(() => parseAtCoderStatement(atcoderPage({ ogUrl: "https://atcoder.jp/contests/abc381/tasks/abc381_b?lang=en" }), "abc381_a"), /parse-failed/);
  assert.throws(() => parseAtCoderStatement(atcoderPage(), "abc381"), /parse-failed/);
  assert.throws(() => parseAtCoderStatement("<html><body>没有题面</body></html>", "abc381_a"), /parse-failed/);
});

test("AtCoder 抓取按官方页解析，题号大小写不敏感并归档题面图片", async () => {
  const fetchImpl = routedFetch([
    [new RegExp(`^${ATCODER_URL.replace(/\?/g, "\\?")}$`), () => new Response(atcoderPage())],
    [new RegExp(`^${ATCODER_IMAGE_URL.replace(/[/.]/g, "\\$&")}$`), (_url, options) => {
      // AtCoder 的题面图同样按来源站校验 referer。
      assert.equal(options.headers.Referer, "https://atcoder.jp/");
      return new Response(PNG, { headers: { "Content-Type": "image/png" } });
    }],
  ]);
  const result = await fetchStatement({ platform: "AtCoder", problemNumber: "ABC381_A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.problemNumber, "abc381_a");
  assert.equal(result.source.kind, "atcoder-html");
  assert.equal(result.source.url, ATCODER_URL);
  assert.equal(result.source.parserVersion, "atcoder-html-v1");
  const fileName = `statement-${sha(PNG)}.png`;
  assert.match(result.description, new RegExp(`!\\[figure\\]\\(\\./${fileName}\\)`));
  assert.equal(result.images.length, 1);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), [ATCODER_URL, ATCODER_IMAGE_URL]);
});

test("AtCoder 官方页单源抓取的失败原因（退回镜像由 fetchStatement 负责）", async () => {
  const notFound = await fetchAtCoderStatement({ problemNumber: "abc999_z" }, { fetchImpl: async () => new Response("", { status: 404 }) });
  assert.deepEqual(notFound, { status: "unavailable", problemNumber: "abc999_z", reason: "not-found", retryable: false });
  const limited = await fetchAtCoderStatement({ problemNumber: "abc381_a" }, { fetchImpl: async () => new Response("", { status: 429 }) });
  assert.equal(limited.reason, "blocked");
  assert.equal(limited.retryable, false);
  // 题号拼不出题目页：一个请求都不发。
  let calls = 0;
  const invalid = await fetchAtCoderStatement({ problemNumber: "abc381" }, { fetchImpl: async () => { calls += 1; return new Response(""); } });
  assert.equal(invalid.reason, "parse-failed");
  assert.equal(calls, 0);
});

// ── AtCoder 题面的洛谷镜像（www.luogu.com.cn/problem/AT_<task>）──────────────
// 实测：atcoder.jp 对机房出口整体 403（Workers 取不到官方页），洛谷的 AT_ 页面则可达，
// 因此官方页失败后必须能退回镜像，否则用户在生产环境里永远抓不到 AtCoder 题面。
const LUOGU_AT_URL = "https://www.luogu.com.cn/problem/AT_abc381_a";
// 形态照抄真实页面：洛谷的 AT_ 题面正文是纯 Markdown 文本（不是 HTML），
// 样例单独以 `[in, out]` 数组对给出，正文首行是 `[problemUrl]: <原题地址>`。
const luoguAtProblem = {
  pid: "AT_abc381_a",
  name: "[ABC381A] 11/22 String",
  difficulty: 1,
  content: {
    name: "[ABC381A] 11/22 String",
    description: "[problemUrl]: https://atcoder.jp/contests/abc381/tasks/abc381_a\n\n> この問題の定義は C 問題と同じです。\n\n文字列 $ T $ が与えられます。\n\n- $ 1 \\leq N \\leq 100 $\n- $ S $ は `1` からなる\n",
    formatI: "入力は以下の形式で標準入力から与えられる。\n\n> $ N $ $ S $",
    formatO: "$ S $ が条件を満たせば `Yes` を出力せよ。",
    hint: "### 制約\n\n- $ N $ は整数",
  },
  samples: [["5\r\n11/22", "Yes"], ["1\r\n/", "Yes"]],
};
const luoguAtPage = (problem) => `<html><head><title>${problem.name} - 洛谷</title></head><body><script id="lentille-context" type="application/json">${JSON.stringify({ data: { problem } }).replace(/<\//g, "<\\/")}</script></body></html>`;
const ATCODER_BLOCKED = [/^https:\/\/atcoder\.jp\//, () => new Response("", { status: 403 })];

test("洛谷 AT_ 镜像页保留 Markdown 结构、原题地址与数组样例", () => {
  const parsed = parseLuoguAtCoderStatement(luoguAtPage(luoguAtProblem), "abc381_a");
  assert.match(parsed.description, /^# \[ABC381A\] 11\/22 String/);
  assert.match(parsed.description, /## 题目描述/);
  assert.match(parsed.description, /## 输入格式/);
  assert.match(parsed.description, /## 输出格式/);
  assert.match(parsed.description, /## 说明\/提示/);
  // 「[problemUrl]: …」是 Markdown 的链接引用定义，渲染时会整行消失，必须改写。
  assert.match(parsed.description, /原题链接：https:\/\/atcoder\.jp\/contests\/abc381\/tasks\/abc381_a/);
  assert.doesNotMatch(parsed.description, /\[problemUrl\]/);
  // 换行是结构：引用与列表不能被折叠成一行。
  assert.match(parsed.description, /\n> この問題の定義は C 問題と同じです。\n/);
  assert.match(parsed.description, /\n- \$ 1 \\leq N \\leq 100 \$\n/);
  assert.match(parsed.description, /\$ S \$ が条件を満たせば `Yes` を出力せよ。/);
  // 样例是数组对，也要转成 fenced code。
  assert.match(parsed.description, /### 样例 1\n输入：\n```\n5\n11\/22\n```\n输出：\n```\nYes\n```/);
  assert.match(parsed.description, /### 样例 2/);
  // 页面是别的题（pid 不符）时不能把正文写进记录。
  assert.throws(() => parseLuoguAtCoderStatement(luoguAtPage({ ...luoguAtProblem, pid: "AT_abc381_b" }), "abc381_a"), /parse-failed/);
  // 正文里的 `<` 不是标签开头，不能被标签解析器吃掉。
  const withComparison = parseLuoguAtCoderStatement(luoguAtPage({ ...luoguAtProblem, content: { description: "制約は $ 1 \\leq N $ と 2 < 3 です。" }, samples: [] }), "abc381_a");
  assert.match(withComparison.description, /2 < 3/);
});

test("AtCoder 官方页被拦截时退回洛谷 AT_ 镜像", async () => {
  const fetchImpl = routedFetch([ATCODER_BLOCKED, [new RegExp(`^${LUOGU_AT_URL}$`), () => new Response(luoguAtPage(luoguAtProblem))]]);
  const result = await fetchStatement({ platform: "AtCoder", problemNumber: "abc381_a" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.problemNumber, "abc381_a");
  assert.equal(result.source.kind, "luogu-mirror");
  assert.equal(result.source.url, LUOGU_AT_URL);
  assert.equal(result.source.parserVersion, "luogu-atcoder-mirror-v1");
  assert.deepEqual(result.warnings, ["mirror-source"]);
  assert.match(result.description, /# \[ABC381A\] 11\/22 String/);
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), [ATCODER_URL, LUOGU_AT_URL]);
});

test("AtCoder 两个来源都失败时保留官方页的失败原因", async () => {
  const fetchImpl = routedFetch([ATCODER_BLOCKED, [new RegExp(`^${LUOGU_AT_URL}$`), () => new Response("", { status: 404 })]]);
  const result = await fetchStatement({ platform: "AtCoder", problemNumber: "abc381_a" }, { fetchImpl });
  assert.deepEqual(result, { status: "unavailable", problemNumber: "abc381_a", reason: "blocked", retryable: false });
  assert.equal(fetchImpl.calls.length, 2);
});

test("AtCoder 官方页可达时不再请求镜像", async () => {
  const fetchImpl = routedFetch([
    [new RegExp(`^${ATCODER_URL.replace(/\?/g, "\\?")}$`), () => new Response(atcoderPage({ japanese: false }))],
    [new RegExp(`^${ATCODER_IMAGE_URL.replace(/[/.]/g, "\\$&")}$`), () => new Response(PNG, { headers: { "Content-Type": "image/png" } })],
  ]);
  const result = await fetchStatement({ platform: "AtCoder", problemNumber: "abc381_a" }, { fetchImpl });
  assert.equal(result.source.kind, "atcoder-html");
  assert.deepEqual(fetchImpl.calls.map((call) => call.url), [ATCODER_URL, ATCODER_IMAGE_URL]);
});

test("洛谷镜像单独调用时同样解析 AT_ 页面", async () => {
  const fetchImpl = routedFetch([[new RegExp(`^${LUOGU_AT_URL}$`), () => new Response(luoguAtPage(luoguAtProblem))]]);
  const result = await fetchLuoguAtCoderStatement({ problemNumber: "ABC381_A" }, { fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(result.problemNumber, "abc381_a");
  assert.equal(result.source.url, LUOGU_AT_URL);
  const missing = await fetchLuoguAtCoderStatement({ problemNumber: "abc381" }, { fetchImpl });
  assert.equal(missing.reason, "parse-failed");
});

// ── 浏览器小书签回传的官方页源码 ─────────────────────────────────────────────
// AtCoder 对机房出口整体 403、浏览器跨域又读不到，只有跑在 atcoder.jp 上的代码能取到
// 官方页；这条路径不做任何上游请求，只用同一个解析器处理用户粘回来的源码。
const noFetch = async (url) => { throw new Error(`不应发起请求：${url}`); };

test("回传的官方页源码用同一个解析器处理，且不请求上游", async () => {
  const result = await statementFromAtCoderHtml({ problemNumber: "abc381_a", html: atcoderPage({ japanese: false }) }, { fetchImpl: noFetch });
  assert.equal(result.status, "ok");
  assert.equal(result.problemNumber, "abc381_a");
  assert.equal(result.source.kind, "atcoder-html");
  assert.equal(result.source.url, ATCODER_URL, "来源地址取页面自己声明的 og:url");
  assert.equal(result.source.parserVersion, "atcoder-html-v1");
  assert.match(result.description, /# A - 11\/22 String/);
  assert.match(result.description, /时间限制：2 sec/);
  // 客户端来源要标注：正文是官方页原文，但抓取发生在浏览器里。
  assert.deepEqual(result.warnings, ["client-html", "external-images"]);
});

test("回传的源码不是这道题时判 parse-failed（og:url 校验）", async () => {
  const mismatch = await statementFromAtCoderHtml({ problemNumber: "abc381_a", html: atcoderPage({ ogUrl: "https://atcoder.jp/contests/abc381/tasks/abc381_b?lang=en" }) }, { fetchImpl: noFetch });
  assert.equal(mismatch.status, "unavailable");
  assert.equal(mismatch.reason, "parse-failed");
  const notAProblem = await statementFromAtCoderHtml({ problemNumber: "abc381_a", html: "<html><body>随便一段文字</body></html>" }, { fetchImpl: noFetch });
  assert.equal(notAProblem.reason, "parse-failed");
  const badNumber = await statementFromAtCoderHtml({ problemNumber: "abc381", html: atcoderPage() }, { fetchImpl: noFetch });
  assert.equal(badNumber.reason, "parse-failed");
});

test("回传的源码超过上限时拒绝，不解析", async () => {
  const huge = `${atcoderPage()}<p>${"x".repeat(2 * 1024 * 1024)}</p>`;
  const result = await statementFromAtCoderHtml({ problemNumber: "abc381_a", html: huge }, { fetchImpl: noFetch });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "too-large");
});
